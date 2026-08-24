// src/lib/inlineEditMonaco.ts
import { useInlineEditStore, type InlineEditTarget } from '@/stores/inlineEditStore'
import { useInlineEditSettingsStore } from '@/stores/inlineEditSettingsStore'
import { getCompletionContext } from './autocompleteContext'
import { startInlineEdit, cancelInlineEdit, subscribeToInlineEditEvents } from './inlineEditClient'
import type * as Monaco from 'monaco-editor'

// Bounds the size of the <selection> block sent to `claude -p`. Unlike
// prefix/suffix (capped at 4000/2000 chars via getCompletionContext), the
// selection itself was previously uncapped — a "select all, Cmd+K" on a
// large file could put the whole file into a single argv element, risking
// an ARG_MAX spawn failure and, well below that threshold, silently burning
// significant subscription quota on an oversized request. Selections over
// this cap are rejected before any request is sent (see submit()).
const MAX_SELECTION_CHARS = 4000

// Unlike autocomplete's postProcessCompletion, this must NOT unconditionally
// trim(): the replacement text is inserted via executeEdits over a selection
// that may itself end with a newline (a full-line selection) or start with
// meaningful leading indentation on its very first line — the model's
// <prefix> only extends to the selection's start column, so when a
// selection starts at column 1 the model must reproduce that line's
// indentation itself. Unlike autocomplete's cursor-insertion case, that
// indentation is real here even with no preceding blank line, so it's never
// safe to treat "leading whitespace with no newline before it" as noise.
// Only strip complete leading blank LINES (whitespace immediately followed
// by a newline, repeated) and prefer a fenced block's contents over
// surrounding prose — never touch the first real line's own indentation or
// any trailing whitespace.
export function postProcessEditText(raw: string): string {
  const text = raw.replace(/^(?:[ \t]*\n)+/, '')

  const fenced = text.match(/```[a-zA-Z0-9]*\n([\s\S]*?)\n?```/)
  return fenced ? fenced[1] : text
}

export function registerInlineEditCommands(
  editor: Monaco.editor.IStandaloneCodeEditor,
  monaco: typeof Monaco
): void {
  subscribeToInlineEditEvents()

  // The panel is split across two Monaco mechanisms, each used for what it's
  // actually built for:
  //   - A content widget renders the real, interactive content (input,
  //     buttons). Monaco's own mouse-target resolution explicitly special-
  //     cases content-widget DOM (see mouseTarget.js: isChildOfContentWidgets
  //     short-circuits before any cursor/selection hit-testing runs), which
  //     is exactly why VSCode itself uses this layer for the suggest widget,
  //     parameter hints, hover, etc. — all fully interactive.
  //   - A view zone, kept empty (no content, no listeners), exists purely to
  //     reserve vertical space so the content widget's row doesn't overlap
  //     the code that follows. View zones are NOT given the same treatment:
  //     Monaco geometrically hit-tests them as regular editor content (see
  //     _hitTestViewZone), so anything interactive placed directly inside
  //     one competes with Monaco's own cursor/selection handling for the
  //     same mousedown — which is why an earlier version of this file (panel
  //     content rendered straight into the view zone) had buttons and inputs
  //     that visually existed but silently never received clicks.
  let zoneId: string | null = null
  let widget: Monaco.editor.IContentWidget | null = null
  let decorationIds: string[] = []

  function targetRange(target: InlineEditTarget): Monaco.Range {
    return new monaco.Range(target.startLineNumber, target.startColumn, target.endLineNumber, target.endColumn)
  }

  function clearDecorations() {
    decorationIds = editor.deltaDecorations(decorationIds, [])
  }

  function clearZone() {
    if (zoneId === null) return
    const id = zoneId
    zoneId = null
    editor.changeViewZones((accessor) => accessor.removeZone(id))
  }

  function clearWidget() {
    if (!widget) return
    editor.removeContentWidget(widget)
    widget = null
  }

  function teardown() {
    // Only an editor that actually had a panel/decorations up needs its
    // focus restored. Every registered editor's store subscription fires on
    // every transition to idle (including ones owned by a sibling split
    // pane), so an unconditional editor.focus() here would steal focus into
    // a pane that was never showing anything.
    const hadActiveUi = zoneId !== null || widget !== null || decorationIds.length > 0
    clearZone()
    clearWidget()
    clearDecorations()
    editor.updateOptions({ readOnly: false })
    if (hadActiveUi) editor.focus()
  }

  // p-2.5 = 10px padding on each side.
  const PANEL_PADDING = 20

  function panelShell(borderClass: string): { container: HTMLElement; innerWidth: number } {
    const container = document.createElement('div')
    // A full border + all-corners radius + vertical margin, not just a left
    // accent strip flush against the code — bg-panel sits only a shade off
    // the editor's own background, so a one-sided strip left the panel's
    // top/right/bottom edges blending straight into the surrounding code
    // with no visible boundary.
    container.className = `bg-panel border ${borderClass} rounded-lg shadow-lg shadow-black/40 p-2.5`
    container.style.boxSizing = 'border-box'
    container.style.marginTop = '4px'
    container.style.marginBottom = '4px'
    // Percentage widths are unreliable inside Monaco's content-widget layer
    // (its containing block isn't guaranteed to have the definite width a %
    // needs to resolve against), so the panel's width is computed directly
    // from the editor's own layout info instead of left to CSS to resolve.
    const contentWidth = editor.getLayoutInfo().contentWidth
    const panelWidth = Math.max(280, Math.min(contentWidth - 32, 640))
    container.style.width = `${panelWidth}px`
    return { container, innerWidth: panelWidth - PANEL_PADDING }
  }

  function buildPromptPanel(target: InlineEditTarget): HTMLElement {
    const { container, innerWidth } = panelShell('border-accent')

    const input = document.createElement('input')
    input.type = 'text'
    input.placeholder = 'Describe the change…'
    input.className = 'bg-bg border border-border rounded px-2 py-1 text-sm text-fg focus:outline-none focus:border-accent/60'
    input.style.boxSizing = 'border-box'
    // An explicit pixel width, not flex-grow: flex-basis/grow on the root
    // node Monaco takes as a content widget's domNode was observed not
    // resolving the way the identical rule does one level down (e.g. the
    // reviewing panel's button row, a *nested* flex child) — whatever
    // sizing pass Monaco runs against the widget's own root apparently
    // doesn't leave flex-grow room to work with. Sizing directly against
    // the same contentWidth-derived number used for the panel itself sidesteps
    // that entirely.
    input.style.width = `${innerWidth}px`
    container.appendChild(input)

    input.addEventListener('keydown', (e) => {
      e.stopPropagation()
      if (e.key === 'Enter') {
        e.preventDefault()
        const instruction = input.value.trim()
        if (!instruction) return
        submit(target, instruction)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        cancelPrompting()
      }
    })

    // Double rAF: Monaco's view-zone DOM insertion is itself deferred to a
    // layout pass that can land a frame after changeViewZones() returns
    // (unlike content widgets, which attach immediately). A single rAF can
    // fire before that pass completes, focusing a not-yet-attached node —
    // silently a no-op. Waiting a second frame guarantees the node is live.
    requestAnimationFrame(() => requestAnimationFrame(() => input.focus()))
    return container
  }

  function buildGeneratingPanel(text: string): HTMLElement {
    const { container } = panelShell('border-accent')

    const pre = document.createElement('div')
    pre.className = 'text-sm font-mono whitespace-pre-wrap text-fg'
    pre.textContent = text.length > 0 ? text : '…'
    container.appendChild(pre)

    const hint = document.createElement('div')
    hint.className = 'text-xs text-fg-muted mt-1.5'
    hint.textContent = 'Generating… (Esc to cancel)'
    container.appendChild(hint)

    return container
  }

  function buildReviewingPanel(target: InlineEditTarget, text: string): HTMLElement {
    const { container } = panelShell('border-accent')

    const pre = document.createElement('div')
    pre.className = 'text-sm font-mono whitespace-pre-wrap text-fg'
    pre.textContent = text
    container.appendChild(pre)

    const actions = document.createElement('div')
    actions.className = 'flex items-center gap-1.5 mt-2'
    actions.style.display = 'flex'

    const acceptBtn = document.createElement('button')
    acceptBtn.type = 'button'
    acceptBtn.textContent = 'Accept ⏎'
    acceptBtn.className = 'px-2 py-1 text-xs rounded bg-accent/20 text-accent border border-accent/40 hover:bg-accent/30'
    acceptBtn.addEventListener('click', () => acceptEdit())
    actions.appendChild(acceptBtn)

    const rejectBtn = document.createElement('button')
    rejectBtn.type = 'button'
    rejectBtn.textContent = 'Reject Esc'
    rejectBtn.className = 'px-2 py-1 text-xs rounded bg-bg text-fg-muted border border-border hover:text-fg'
    rejectBtn.addEventListener('click', () => rejectEdit())
    actions.appendChild(rejectBtn)

    const refineInput = document.createElement('input')
    refineInput.type = 'text'
    refineInput.placeholder = 'Ask for another change…'
    refineInput.className = 'bg-bg border border-border rounded px-2 py-1 text-xs text-fg focus:outline-none focus:border-accent/60'
    refineInput.style.flex = '1 1 0%'
    refineInput.style.minWidth = '0'
    refineInput.addEventListener('keydown', (e) => {
      e.stopPropagation()
      if (e.key === 'Enter') {
        e.preventDefault()
        const instruction = refineInput.value.trim()
        if (!instruction) return
        submitRefine(target, instruction)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        rejectEdit()
      }
    })
    actions.appendChild(refineInput)

    container.appendChild(actions)
    return container
  }

  function buildErrorPanel(message: string): HTMLElement {
    const { container } = panelShell('border-red-500')

    const msg = document.createElement('div')
    msg.className = 'text-sm font-mono text-red-400'
    msg.textContent = message
    container.appendChild(msg)

    const dismissBtn = document.createElement('button')
    dismissBtn.type = 'button'
    dismissBtn.textContent = 'Dismiss Esc'
    dismissBtn.className = 'mt-2 px-2 py-1 text-xs rounded bg-bg text-fg-muted border border-border hover:text-fg'
    dismissBtn.addEventListener('click', () => useInlineEditStore.getState().reset())
    container.appendChild(dismissBtn)

    return container
  }

  function renderPanel(target: InlineEditTarget, domNode: HTMLElement, heightInLines: number) {
    // Reserve the vertical space with a blank spacer zone first...
    editor.changeViewZones((accessor) => {
      if (zoneId !== null) accessor.removeZone(zoneId)
      zoneId = accessor.addZone({
        afterLineNumber: target.endLineNumber,
        heightInLines,
        domNode: document.createElement('div'),
      })
    })

    // ...then place the real, interactive content in a content widget
    // anchored to the same line, positioned BELOW it — i.e. right at the top
    // of the gap the spacer zone above just reserved.
    clearWidget()
    const contentWidget: Monaco.editor.IContentWidget = {
      getId: () => 'vide.inlineEdit.panel',
      getDomNode: () => domNode,
      getPosition: () => ({
        position: { lineNumber: target.endLineNumber, column: 1 },
        preference: [monaco.editor.ContentWidgetPositionPreference.BELOW],
      }),
    }
    widget = contentWidget
    editor.addContentWidget(contentWidget)
  }

  function cancelPrompting() {
    useInlineEditStore.getState().closePrompt()
  }

  function submit(target: InlineEditTarget, instruction: string) {
    const model = editor.getModel()
    if (!model) return

    const range = targetRange(target)
    const selection = model.getValueInRange(range)

    // Reject oversized selections before spawning anything — see
    // MAX_SELECTION_CHARS above. This is a pre-flight validation failure,
    // not a mid-generation one, so it doesn't go through the fail()/
    // error-display path built for the latter.
    if (selection.length > MAX_SELECTION_CHARS) {
      useInlineEditStore.getState().closePrompt()
      return
    }

    const { prefix } = getCompletionContext(model, {
      lineNumber: target.startLineNumber,
      column: target.startColumn,
    })
    const { suffix } = getCompletionContext(model, {
      lineNumber: target.endLineNumber,
      column: target.endColumn,
    })
    const language = model.getLanguageId()
    const selectedModel = useInlineEditSettingsStore.getState().model

    if (selection.length > 0) {
      decorationIds = editor.deltaDecorations(decorationIds, [{
        range,
        options: { inlineClassName: 'inline-edit-removed' },
      }])
    }

    editor.updateOptions({ readOnly: true })

    startInlineEdit({ prefix, suffix, selection, instruction, language, model: selectedModel })
    editor.focus()
  }

  function submitRefine(target: InlineEditTarget, instruction: string) {
    const model = editor.getModel()
    if (!model) return

    // A refinement asks the model to further edit its own last draft, not
    // the original selection — so the draft itself (not model.getValueInRange,
    // which still reflects the untouched document) becomes the <selection>
    // sent for this round. The target range doesn't move: nothing has been
    // applied to the document yet, so prefix/suffix around it are still valid.
    const draft = useInlineEditStore.getState().accumulatedText

    const { prefix } = getCompletionContext(model, {
      lineNumber: target.startLineNumber,
      column: target.startColumn,
    })
    const { suffix } = getCompletionContext(model, {
      lineNumber: target.endLineNumber,
      column: target.endColumn,
    })
    const language = model.getLanguageId()
    const selectedModel = useInlineEditSettingsStore.getState().model

    startInlineEdit({ prefix, suffix, selection: draft, instruction, language, model: selectedModel })
    editor.focus()
  }

  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK, () => {
    if (!useInlineEditSettingsStore.getState().enabled) return
    if (useInlineEditStore.getState().status !== 'idle') {
      cancelInlineEdit()
    }

    const selection = editor.getSelection()
    if (!selection) return

    const target: InlineEditTarget = {
      startLineNumber: selection.startLineNumber,
      startColumn: selection.startColumn,
      endLineNumber: selection.endLineNumber,
      endColumn: selection.endColumn,
    }

    useInlineEditStore.getState().openPrompt(editor, target)
  })

  function acceptEdit() {
    const state = useInlineEditStore.getState()
    if (!state.target) return
    editor.updateOptions({ readOnly: false })
    editor.executeEdits('inline-edit', [{ range: targetRange(state.target), text: postProcessEditText(state.accumulatedText) }])
    state.reset()
  }

  function rejectEdit() {
    useInlineEditStore.getState().reset()
  }

  editor.onKeyDown((e) => {
    const state = useInlineEditStore.getState()
    if (state.owner !== editor) return

    if (state.status === 'reviewing' && e.keyCode === monaco.KeyCode.Enter) {
      e.preventDefault()
      // Also stop propagation: this IKeyboardEvent wraps the same browser
      // event Monaco's own keybinding service dispatches from, and its own
      // Enter-inserts-newline command could otherwise still fire alongside
      // acceptEdit() below, inserting a stray newline into the document.
      e.stopPropagation()
      acceptEdit()
    } else if (state.status === 'generating' && e.keyCode === monaco.KeyCode.Escape) {
      e.preventDefault()
      cancelInlineEdit()
    } else if (state.status === 'prompting' && e.keyCode === monaco.KeyCode.Escape) {
      // Reachable when focus has moved off the prompt input back onto the
      // editor itself (e.g. after a click that didn't land outside the
      // panel) — the input's own keydown handler covers the focused case.
      e.preventDefault()
      cancelPrompting()
    } else if ((state.status === 'reviewing' || state.status === 'error') && e.keyCode === monaco.KeyCode.Escape) {
      e.preventDefault()
      useInlineEditStore.getState().reset()
    }
  })

  // Clicking anywhere outside the prompt panel dismisses it, same as most
  // editors' inline-input affordances. Scoped to the 'prompting' phase only:
  // a stray click during 'generating'/'reviewing' must not silently discard
  // an in-flight or completed generation — those require an explicit
  // action (Esc, or a button click, both of which land inside the panel or
  // go through the keydown handler above).
  //
  // This is split across two signals rather than one raw hit-test against
  // zoneDomNode. Monaco stacks several internal layers (selection/overlay,
  // margin, etc.) above the view-zones layer for click-catching purposes,
  // so a click that visually lands on our own input can resolve to one of
  // those internal elements as e.target — a plain `zoneDomNode.contains`
  // check saw that as "outside" and closed the panel out from under the
  // click that was meant to focus it.
  //   - A click that lands anywhere inside the editor's own DOM subtree
  //     (including our zone) is left to the focus signal below.
  //   - A click that lands completely outside the editor (a different pane,
  //     the tab bar, etc.) is caught here directly.
  function onDocumentMouseDown(e: MouseEvent) {
    const state = useInlineEditStore.getState()
    if (state.owner !== editor || state.status !== 'prompting') return
    const editorNode = editor.getDomNode()
    if (editorNode && editorNode.contains(e.target as Node)) return
    cancelPrompting()
  }
  document.addEventListener('mousedown', onDocumentMouseDown, true)

  // Fires only when Monaco's own text area regains focus — i.e. the user
  // actually clicked into the code (not into our plain <input>, which is a
  // sibling DOM element Monaco doesn't consider part of its text focus, and
  // not as a side effect of our own rAF-deferred input.focus() on open).
  const focusSubscription = editor.onDidFocusEditorText(() => {
    const state = useInlineEditStore.getState()
    if (state.owner === editor && state.status === 'prompting') cancelPrompting()
  })

  const unsubscribe = useInlineEditStore.subscribe((state) => {
    if (state.owner !== editor || state.status === 'idle') {
      teardown()
      return
    }
    if (!state.target) return

    const textLines = (n: number) => Math.max(1, n)

    if (state.status === 'prompting') {
      renderPanel(state.target, buildPromptPanel(state.target), 2)
    } else if (state.status === 'generating') {
      const lines = textLines(state.accumulatedText.split('\n').length)
      renderPanel(state.target, buildGeneratingPanel(state.accumulatedText), lines + 2)
    } else if (state.status === 'reviewing') {
      const lines = textLines(state.accumulatedText.split('\n').length)
      renderPanel(state.target, buildReviewingPanel(state.target, state.accumulatedText), lines + 3)
    } else if (state.status === 'error') {
      renderPanel(state.target, buildErrorPanel(state.errorMessage ?? 'Something went wrong'), 3)
    }
  })

  editor.onDidDispose(() => {
    unsubscribe()
    focusSubscription.dispose()
    document.removeEventListener('mousedown', onDocumentMouseDown, true)
    if (useInlineEditStore.getState().owner === editor) {
      cancelInlineEdit()
    }
  })
}
