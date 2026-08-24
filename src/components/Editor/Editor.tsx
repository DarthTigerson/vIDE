import { useEffect, useRef, useState } from 'react'
import MonacoEditor, { DiffEditor } from '@monaco-editor/react'
import type * as Monaco from 'monaco-editor'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { useEditorStore, type EditorLayoutNode } from '@/stores/editorStore'
import { useSearchStore } from '@/stores/searchStore'
import { useThemeStore, MONACO_THEMES } from '@/stores/themeStore'
import { defineMonacoThemes, glassMonacoThemeId } from '@/monacoThemes'
import { useFontSizeStore } from '@/stores/fontSizeStore'
import { useInstanceFontSizeStore } from '@/stores/instanceFontSizeStore'
import { useDisplayStore } from '@/stores/displayStore'
import { useFileStore } from '@/stores/fileStore'
import { useNotesStore } from '@/stores/notesStore'
import { useGitReposStore } from '@/stores/gitReposStore'
import { useGitStore } from '@/stores/gitStore'
import { useEditorSettingsStore } from '@/stores/editorSettingsStore'
import { useClaudeStore } from '@/stores/claudeStore'
import { registerAutocompleteProvider } from '@/lib/monacoAutocomplete'
import { registerInlineEditCommands } from '@/lib/inlineEditMonaco'
import { registerLspDefinitionProvider } from '@/lib/lspClient'
import { registerModelPath } from '@/lib/lspModelRegistry'
import { formatSelectionForAssistant, toRelativePath } from '@/lib/sendSelectionToAssistant'
import { computeLineChanges } from '@/lib/lineDiff'
import { getLastFocusedEditor, setLastFocusedEditor } from '@/lib/lastFocusedEditor'
import { TabBar } from './TabBar'
import { EditorBreadcrumb } from './EditorBreadcrumb'
import { EditorContextMenu } from './EditorContextMenu'
import { PaneDropZoneOverlay } from './PaneDropZoneOverlay'
import { EmptyEditorBackground } from './EmptyEditorBackground'
import { detectLang } from './utils'
import {
  isSettingsTab,
  isGitLogTab,
  isGitGraphTab,
  isGitBranchDiffTab,
  isGraphifyGraphTab,
  isUsageGraphTab,
  isTodoBoardTab,
  getTodoBoardProjectId,
  isTodoDetailTab,
  getTodoDetailIds,
  isNotesBoardTab,
  getNotesBoardProjectId,
  isTerminalTab,
  getTerminalId,
  isBrowserTab,
  getBrowserId,
  DISPLAY_TAB_PATH,
  EDITOR_SETTINGS_TAB_PATH,
  GIT_SETTINGS_TAB_PATH,
  BROWSER_SETTINGS_TAB_PATH,
  MODELS_SETTINGS_TAB_PATH,
  GRAPHIFY_SETTINGS_TAB_PATH,
  JIRA_SETTINGS_TAB_PATH,
  DOCKER_SETTINGS_TAB_PATH,
  GENERAL_SETTINGS_TAB_PATH,
} from '@/components/Settings/paths'
import { TerminalTab } from '@/components/Terminal/TerminalTab'
import { BrowserTab } from '@/components/Browser/BrowserTab'
import { DisplayPage } from '@/components/Settings/DisplayPage'
import { GitSettingsPage } from '@/components/Settings/GitSettingsPage'
import { EditorSettingsPage } from '@/components/Settings/EditorSettingsPage'
import { BrowserSettingsPage } from '@/components/Settings/BrowserSettingsPage'
import { ModelsSettingsPage } from '@/components/Settings/ModelsSettingsPage'
import { GraphifySettingsPage } from '@/components/Settings/GraphifySettingsPage'
import { JiraSettingsPage } from '@/components/Settings/JiraSettingsPage'
import { DockerSettingsPage } from '@/components/Settings/DockerSettingsPage'
import { GeneralSettingsPage } from '@/components/Settings/GeneralSettingsPage'
import { DockerLogsPage } from '@/components/Docker/DockerLogsPage'
import { isDockerLogsTab } from '@/components/Docker/paths'
import { isGitDiffTab, parseGitDiffPath, isGitCommitDiffTab, parseGitCommitDiffPath } from '@/components/Git/paths'
import { GitLogView } from '@/components/Git/GitLogView'
import { GitGraphPage } from '@/components/Git/GitGraphPage'
import { GitBranchDiffPage } from '@/components/Git/GitBranchDiffPage'
import { GraphifyGraphPage } from '@/components/Graphify/GraphifyGraphPage'
import { UsageGraphPage } from '@/components/UsagePanel/UsageGraphPage'
import { TodoBoardPage } from '@/components/Todo/TodoBoardPage'
import { TodoDetailPage } from '@/components/Todo/TodoDetailPage'
import { NotesExplorerPage } from '@/components/Notes/NotesExplorerPage'
import {
  isImagePreviewTab,
  parseImagePreviewPath,
  isMarkdownPreviewTab,
  parseMarkdownPreviewPath,
} from '@/components/Viewer/paths'
import { ImageViewer } from '@/components/Viewer/ImageViewer'
import { MarkdownViewer } from '@/components/Viewer/MarkdownViewer'
import type { GitDiffContent } from '@/types/index'
import { isVirtualTab, isReadOnlyTab } from '@/lib/tabKinds'

async function saveActiveTab({ allowCreateMissing }: { allowCreateMissing: boolean }) {
  const { tabs, activeTabPath, markSaved, setTabMissing } = useEditorStore.getState()
  const tab = tabs.find((t) => t.path === activeTabPath)
  if (!tab || isReadOnlyTab(tab)) return

  if (!allowCreateMissing) {
    const exists = await window.api.pathExists(tab.path)
    if (!exists) {
      setTabMissing(tab.path, true)
      return
    }
  }

  const savedContent = tab.content
  await window.api.writeFile(tab.path, savedContent)
  markSaved(tab.path, savedContent)
  const root = useFileStore.getState().projectRoot
  if (root) {
    useFileStore.getState().refreshTree()
    useGitStore.getState().refreshStatus(root)
  }
}

export function Editor() {
  const tabs = useEditorStore((s) => s.tabs)
  const activeTabPath = useEditorStore((s) => s.activeTabPath)
  const layout = useEditorStore((s) => s.layout)
  const splitActivePane = useEditorStore((s) => s.splitActivePane)
  const autoSaveEnabled = useEditorSettingsStore((s) => s.autoSaveEnabled)
  const activeTab = tabs.find((t) => t.path === activeTabPath) ?? null

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return

      const key = e.key.toLowerCase()

      if (key === 'd') {
        e.preventDefault()
        splitActivePane(e.shiftKey ? 'vertical' : 'horizontal')
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [splitActivePane])

  useEffect(() => {
    return window.api.onMenuSave(() => {
      saveActiveTab({ allowCreateMissing: true })
    })
  }, [])

  useEffect(() => {
    if (!autoSaveEnabled || !activeTab?.dirty || isReadOnlyTab(activeTab)) return

    const timeout = setTimeout(() => {
      saveActiveTab({ allowCreateMissing: false })
    }, 700)

    return () => clearTimeout(timeout)
  }, [
    autoSaveEnabled,
    activeTab?.path,
    activeTab?.content,
    activeTab?.dirty,
  ])

  return (
    <div className="h-full flex flex-col bg-panel overflow-hidden">
      {tabs.length > 0 ? (
        <div className="flex-1 min-h-0">
          <EditorLayout node={layout} />
        </div>
      ) : (
        <div className="flex-1 relative overflow-hidden">
          <EmptyEditorBackground />
        </div>
      )}
    </div>
  )
}

function EditorLayout({ node }: { node: EditorLayoutNode }) {
  if (node.type === 'pane') {
    return <EditorPane paneId={node.id} />
  }

  const horizontal = node.direction === 'horizontal'

  return (
    <PanelGroup
      direction={horizontal ? 'horizontal' : 'vertical'}
      className="h-full min-h-0"
    >
      <Panel minSize={15}>
        <EditorLayout node={node.children[0]} />
      </Panel>
      <PanelResizeHandle
        className={[
          'bg-border hover:bg-accent/60 transition-colors',
          horizontal ? 'w-px cursor-col-resize' : 'h-px cursor-row-resize',
        ].join(' ')}
      />
      <Panel minSize={15}>
        <EditorLayout node={node.children[1]} />
      </Panel>
    </PanelGroup>
  )
}

function EditorPane({ paneId }: { paneId: string }) {
  const tabs = useEditorStore((s) => s.tabs)
  const paneTabs = useEditorStore((s) => s.paneTabs)
  const activePaneId = useEditorStore((s) => s.activePaneId)
  const setActivePane = useEditorStore((s) => s.setActivePane)
  const updateContent = useEditorStore((s) => s.updateContent)
  const revealRequest = useEditorStore((s) => s.revealRequest)
  const themeId = useThemeStore((s) => s.theme)
  const panelStyle = useDisplayStore((s) => s.panelStyle)
  const monacoTheme = panelStyle === 'glass' ? glassMonacoThemeId(themeId) : MONACO_THEMES[themeId]
  const fontSize = useFontSizeStore((s) => s.fontSize)
  const font = useDisplayStore((s) => s.font)
  const wordWrapEnabled = useEditorSettingsStore((s) => s.wordWrapEnabled)
  const projectRoot = useFileStore((s) => s.projectRoot)
  const notesProjects = useNotesStore((s) => s.projects)
  const selectedRepo = useGitReposStore((s) => s.selectedRepo)
  const [diffContent, setDiffContent] = useState<GitDiffContent | null>(null)
  const [editorContextMenu, setEditorContextMenu] = useState<{ x: number; y: number } | null>(null)
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)
  const decorationsRef = useRef<Monaco.editor.IEditorDecorationsCollection | null>(null)
  // Gutter change indicators (colored line numbers for uncommitted changes).
  // Separate from decorationsRef above, which is the ephemeral search-reveal
  // highlight - both live on the same editor instance but must not clobber
  // each other. gutterDecorationsRef is recreated fresh each mount (see
  // onMount below); refreshGutterRef lets the onGitChanged listener further
  // down trigger a recompute on the currently-mounted editor without needing
  // to reach into onMount's own closure state.
  const gutterDecorationsRef = useRef<Monaco.editor.IEditorDecorationsCollection | null>(null)
  const refreshGutterRef = useRef<() => void>(() => {})

  const tabPath = paneTabs[paneId]
  const activeTab = tabs.find((t) => t.path === tabPath) ?? null
  const fontSizeOverride = useInstanceFontSizeStore((s) => (tabPath ? s.overrides[tabPath] : undefined))
  const editorFontSize = fontSizeOverride ?? fontSize
  const isActivePane = activePaneId === paneId
  const isVirtual = isVirtualTab(activeTab)
  const isTerminal = !!activeTab && isTerminalTab(activeTab.path)
  const isBrowser = !!activeTab && isBrowserTab(activeTab.path)
  const isDiff = !!activeTab && isGitDiffTab(activeTab.path)
  const isCommitDiff = !!activeTab && isGitCommitDiffTab(activeTab.path)
  const isGitLog = !!activeTab && isGitLogTab(activeTab.path)
  const isGitGraph = !!activeTab && isGitGraphTab(activeTab.path)
  const isGitBranchDiff = !!activeTab && isGitBranchDiffTab(activeTab.path)
  const isGraphifyGraph = !!activeTab && isGraphifyGraphTab(activeTab.path)
  const isUsageGraph = !!activeTab && isUsageGraphTab(activeTab.path)
  const isTodoBoard = !!activeTab && isTodoBoardTab(activeTab.path)
  const isTodoDetail = !!activeTab && isTodoDetailTab(activeTab.path)
  const isNotesBoard = !!activeTab && isNotesBoardTab(activeTab.path)
  const isDockerLogs = !!activeTab && isDockerLogsTab(activeTab.path)
  const isImagePreview = !!activeTab && isImagePreviewTab(activeTab.path)
  const isMarkdownPreview = !!activeTab && isMarkdownPreviewTab(activeTab.path)
  // Plain file tabs only for now - diff/image/markdown-preview tabs encode
  // their real file path in a scheme (diff://, etc.) rather than using it
  // directly as activeTab.path, so they'd need separate parsing to show here.
  const isPlainFileTab =
    !!activeTab &&
    !isVirtual && !isTerminal && !isBrowser &&
    !isDiff && !isCommitDiff && !isGitLog && !isGitGraph && !isGitBranchDiff &&
    !isGraphifyGraph && !isUsageGraph && !isTodoBoard && !isTodoDetail && !isNotesBoard &&
    !isDockerLogs && !isImagePreview && !isMarkdownPreview

  function activatePane() {
    setActivePane(paneId)
  }

  // A working-tree diff (isDiff — staged/unstaged) can go stale the same
  // way a regular file tab can: edited from outside the app, or staged/
  // unstaged via the terminal. Regular tabs get resynced by
  // syncOpenTabsFromDisk on fs:changed, but that only touches
  // editorStore's tab.content — diff content lives in this component's own
  // state, fetched imperatively, so it needs its own live-refresh trigger.
  // A commit diff (isCommitDiff) is comparing two fixed, immutable
  // commits, so it doesn't need this — but re-running the fetch for it
  // when the tick changes is harmless, just an extra no-op-ish IPC call.
  const [diffRefreshTick, setDiffRefreshTick] = useState(0)

  useEffect(() => {
    if (!projectRoot) return
    const offFs = window.api.onFsChanged((cwd) => {
      if (cwd === projectRoot) setDiffRefreshTick((t) => t + 1)
    })
    const offGit = window.api.onGitChanged((cwd) => {
      if (cwd === selectedRepo) {
        setDiffRefreshTick((t) => t + 1)
        // HEAD moved (commit/checkout/stage) - the cached blob is stale.
        refreshGutterRef.current()
      }
    })
    return () => {
      offFs()
      offGit()
    }
  }, [projectRoot, selectedRepo])

  useEffect(() => {
    if (!activeTab || (!isDiff && !isCommitDiff)) {
      setDiffContent(null)
      return
    }

    let cancelled = false
    const request = isCommitDiff
      ? (() => {
          const { repoRoot, hash, path } = parseGitCommitDiffPath(activeTab.path)
          return window.api.gitCommitDiff(repoRoot, hash, path)
        })()
      : (() => {
          const { repoRoot, path, staged } = parseGitDiffPath(activeTab.path)
          return window.api.gitDiff(repoRoot, path, staged)
        })()
    request.then((content) => {
      if (!cancelled) setDiffContent(content)
    })

    return () => {
      cancelled = true
    }
  }, [activeTab?.path, isDiff, isCommitDiff, diffRefreshTick])

  useEffect(() => {
    if (!activeTab || isReadOnlyTab(activeTab)) return

    let cancelled = false
    window.api.pathExists(activeTab.path).then((exists) => {
      if (!cancelled) {
        useEditorStore.getState().setTabMissing(activeTab.path, !exists)
      }
    })

    return () => {
      cancelled = true
    }
  }, [activeTab?.path])

  useEffect(() => {
    if (!revealRequest || revealRequest.path !== tabPath) return
    const editor = editorRef.current
    if (!editor) return

    editor.revealLineInCenter(revealRequest.line)
    editor.setPosition({ lineNumber: revealRequest.line, column: revealRequest.col })
    editor.focus()

    const model = editor.getModel()
    if (model) {
      decorationsRef.current?.clear()
      decorationsRef.current = editor.createDecorationsCollection([{
        range: {
          startLineNumber: revealRequest.line,
          startColumn: revealRequest.col,
          endLineNumber: revealRequest.line,
          endColumn: revealRequest.col + revealRequest.searchTerm.length,
        },
        options: { inlineClassName: 'search-reveal-highlight' },
      }])
      setTimeout(() => decorationsRef.current?.clear(), 3000)
    }

    useEditorStore.getState().clearRevealRequest()
  }, [revealRequest, tabPath])

  return (
    <div
      className={[
        'h-full min-h-0 flex flex-col bg-panel overflow-hidden outline outline-1 -outline-offset-1',
        isActivePane ? 'outline-accent/50' : 'outline-transparent',
      ].join(' ')}
      onMouseDown={activatePane}
    >
      <TabBar paneId={paneId} />
      {isPlainFileTab && activeTab &&
        !notesProjects.some((p) => activeTab.path.startsWith(p.rootPath + '/')) && (
          <EditorBreadcrumb path={activeTab.path} projectRoot={projectRoot} />
        )}
      <div className="relative flex-1 min-h-0 overflow-hidden">
      <PaneDropZoneOverlay paneId={paneId} />
      {editorContextMenu && editorRef.current && (
        <EditorContextMenu
          x={editorContextMenu.x}
          y={editorContextMenu.y}
          editor={editorRef.current}
          onClose={() => setEditorContextMenu(null)}
        />
      )}
      {activeTab ? (
        isTerminal ? (
          <TerminalTab key={activeTab.path} terminalId={getTerminalId(activeTab.path)} />
        ) : isBrowser ? (
          <BrowserTab key={activeTab.path} browserId={getBrowserId(activeTab.path)} />
        ) : isVirtual ? (
          activeTab.path === GIT_SETTINGS_TAB_PATH ? (
            <GitSettingsPage />
          ) : activeTab.path === EDITOR_SETTINGS_TAB_PATH ? (
            <EditorSettingsPage />
          ) : activeTab.path === BROWSER_SETTINGS_TAB_PATH ? (
            <BrowserSettingsPage />
          ) : activeTab.path === MODELS_SETTINGS_TAB_PATH ? (
            <ModelsSettingsPage />
          ) : activeTab.path === GRAPHIFY_SETTINGS_TAB_PATH ? (
            <GraphifySettingsPage />
          ) : activeTab.path === JIRA_SETTINGS_TAB_PATH ? (
            <JiraSettingsPage />
          ) : activeTab.path === DOCKER_SETTINGS_TAB_PATH ? (
            <DockerSettingsPage />
          ) : activeTab.path === GENERAL_SETTINGS_TAB_PATH ? (
            <GeneralSettingsPage />
          ) : activeTab.path === DISPLAY_TAB_PATH ? (
            <DisplayPage />
          ) : (
            <DisplayPage />
          )
        ) : isGitLog ? (
          <GitLogView />
        ) : isGitGraph ? (
          <GitGraphPage />
        ) : isGraphifyGraph ? (
          <GraphifyGraphPage />
        ) : isUsageGraph ? (
          <UsageGraphPage />
        ) : isTodoBoard ? (
          <TodoBoardPage key={activeTab.path} projectId={getTodoBoardProjectId(activeTab.path)} />
        ) : isTodoDetail ? (
          <TodoDetailPage key={activeTab.path} {...getTodoDetailIds(activeTab.path)} />
        ) : isNotesBoard ? (
          <NotesExplorerPage key={activeTab.path} projectId={getNotesBoardProjectId(activeTab.path)} />
        ) : isDockerLogs ? (
          <DockerLogsPage path={activeTab.path} />
        ) : isGitBranchDiff ? (
          <GitBranchDiffPage />
        ) : isImagePreview ? (
          <ImageViewer key={activeTab.path} path={parseImagePreviewPath(activeTab.path)} />
        ) : isMarkdownPreview ? (
          <MarkdownViewer key={activeTab.path} path={parseMarkdownPreviewPath(activeTab.path)} />
        ) : (isDiff || isCommitDiff) ? (
          <div className="h-full overflow-hidden">
            {diffContent && (
              <DiffEditor
                key={activeTab.path}
                original={diffContent.original}
                modified={diffContent.modified}
                language={detectLang(activeTab.path)}
                theme={monacoTheme}
                beforeMount={defineMonacoThemes}
                options={{
                  readOnly: true,
                  renderSideBySide: true,
                  fontSize: editorFontSize,
                  fontFamily: font,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  wordWrap: wordWrapEnabled ? 'on' : 'off',
                }}
                onMount={(editor, monaco) => {
                  const modified = editor.getModifiedEditor()
                  modified.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Equal, () => {
                    useInstanceFontSizeStore.getState().increase(activeTab.path)
                  })
                  modified.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Minus, () => {
                    useInstanceFontSizeStore.getState().decrease(activeTab.path)
                  })
                  modified.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Digit0, () => {
                    useInstanceFontSizeStore.getState().reset(activeTab.path)
                  })
                  modified.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.KeyZ, () => {
                    useEditorSettingsStore.getState().toggleWordWrap()
                  })
                }}
              />
            )}
          </div>
        ) : (
          <div className="h-full overflow-hidden">
            <MonacoEditor
              key={`${paneId}:${activeTab.path}`}
              value={activeTab.content}
              language={detectLang(activeTab.path)}
              theme={monacoTheme}
              beforeMount={defineMonacoThemes}
              options={{
                fontSize: editorFontSize,
                fontFamily: font,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                lineNumbers: 'on',
                renderLineHighlight: 'all',
                padding: { top: 8 },
                automaticLayout: true,
                inlineSuggest: { enabled: true },
                wordWrap: wordWrapEnabled ? 'on' : 'off',
                // Monaco's own native menu is replaced with EditorContextMenu
                // below (rendered on editor.onContextMenu, wired in onMount) -
                // matches the rest of the app's context menus and lets us
                // control exactly what's in it (e.g. hiding "Change All
                // Occurrences" per the editor settings toggle) without
                // reaching into Monaco's menu-registry internals.
                contextmenu: false,
              }}
              onChange={(val) => updateContent(activeTab.path, val ?? '')}
              onMount={(editor, monaco) => {
                editorRef.current = editor
                editor.onContextMenu((e) => {
                  setEditorContextMenu({ x: e.event.posx, y: e.event.posy })
                })
                registerAutocompleteProvider(monaco)
                registerInlineEditCommands(editor, monaco)
                registerLspDefinitionProvider(monaco)
                const model = editor.getModel()
                if (model) registerModelPath(model, activeTab.path)
                editor.onDidFocusEditorWidget(() => {
                  activatePane()
                  setLastFocusedEditor(editor)
                })
                editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
                  activatePane()
                  saveActiveTab({ allowCreateMissing: true })
                })
                editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyD, () => {
                  activatePane()
                  useEditorStore.getState().splitActivePane('horizontal')
                })
                editor.addCommand(
                  monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyD,
                  () => {
                    activatePane()
                    useEditorStore.getState().splitActivePane('vertical')
                  }
                )
                // Cmd+F is deliberately left unbound here so Monaco's own
                // built-in find widget (already bound to Cmd+F internally)
                // handles it - basic in-file search, no app-level modal.
                editor.addCommand(
                  monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyF,
                  () => { useSearchStore.getState().openSearch() }
                )
                editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyP, () => {
                  useSearchStore.getState().openCommandPalette()
                })
                editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.KeyZ, () => {
                  useEditorSettingsStore.getState().toggleWordWrap()
                })
                editor.addCommand(
                  monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyP,
                  () => { useSearchStore.getState().openActionPalette() }
                )
                editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyT, () => {
                  const id = Date.now().toString(36)
                  useEditorStore.getState().openTab({ path: `terminal://${id}`, content: '', dirty: false })
                })
                editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyL, () => {
                  activatePane()
                  const selection = editor.getSelection()
                  const model = editor.getModel()
                  if (!selection || selection.isEmpty() || !model || !activeTab) {
                    useClaudeStore.getState().focusChat()
                    return
                  }
                  const text = formatSelectionForAssistant({
                    relPath: toRelativePath(activeTab.path, projectRoot),
                    startLine: selection.startLineNumber,
                    endLine: selection.endLineNumber,
                    language: model.getLanguageId(),
                    code: model.getValueInRange(selection),
                  })
                  useClaudeStore.getState().sendSelection(text)
                })
                editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Equal, () => {
                  useInstanceFontSizeStore.getState().increase(activeTab.path)
                })
                editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Minus, () => {
                  useInstanceFontSizeStore.getState().decrease(activeTab.path)
                })
                editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Digit0, () => {
                  useInstanceFontSizeStore.getState().reset(activeTab.path)
                })

                // handle reveal if request was set before this editor mounted
                const req = useEditorStore.getState().revealRequest
                if (req && req.path === activeTab?.path) {
                  editor.revealLineInCenter(req.line)
                  editor.setPosition({ lineNumber: req.line, column: req.col })
                  editor.focus()
                  decorationsRef.current = editor.createDecorationsCollection([{
                    range: {
                      startLineNumber: req.line,
                      startColumn: req.col,
                      endLineNumber: req.line,
                      endColumn: req.col + req.searchTerm.length,
                    },
                    options: { inlineClassName: 'search-reveal-highlight' },
                  }])
                  setTimeout(() => decorationsRef.current?.clear(), 3000)
                  useEditorStore.getState().clearRevealRequest()
                }

                // Gutter change indicators: diff the file's git HEAD blob
                // against the live buffer, live as you type (debounced),
                // not just on save - matches VS Code's behavior.
                //
                // headContent/debounceTimer/cancelled are local to this one
                // mount, not the pane-level refs above (gutterDecorationsRef,
                // refreshGutterRef) - Monaco remounts per file via its own
                // `key`, and headContentRef/refreshGutterRef used to be reset
                // in-place here, so a fetch or debounce timer left in flight
                // from the PREVIOUS file could resolve after the switch and
                // paint decorations using the new file's editor/model with
                // the old file's HEAD content. `cancelled` (flipped by
                // onDidDispose, which fires whenever this exact editor
                // instance is torn down - tab switch or otherwise) closes
                // that window, and also makes a stale refreshGutterRef
                // harmless if the pane switches to a non-file tab, since the
                // old closure just no-ops instead of touching a disposed
                // editor.
                let cancelled = false
                let headContent: string | null = null
                let debounceTimer: ReturnType<typeof setTimeout> | null = null
                gutterDecorationsRef.current = editor.createDecorationsCollection([])

                async function applyGutterDecorations() {
                  if (cancelled || !activeTab) return
                  if (headContent === null) {
                    const fileRepoRoot = useGitReposStore.getState().resolveRepoForPath(activeTab.path)
                    if (!fileRepoRoot) return
                    const relPath = toRelativePath(activeTab.path, fileRepoRoot)
                    try {
                      headContent = await window.api.gitFileAtHead(fileRepoRoot, relPath)
                    } catch {
                      return
                    }
                    if (cancelled) return
                  }
                  const model = editor.getModel()
                  if (!model) return
                  const changes = computeLineChanges(headContent, model.getValue())
                  gutterDecorationsRef.current?.set(changes.map((c) => ({
                    range: new monaco.Range(c.startLine, 1, c.endLine, 1),
                    options: { isWholeLine: true, lineNumberClassName: `git-gutter-${c.type}` },
                  })))
                }

                refreshGutterRef.current = () => {
                  headContent = null
                  applyGutterDecorations()
                }

                editor.onDidDispose(() => {
                  cancelled = true
                  if (debounceTimer) clearTimeout(debounceTimer)
                  setEditorContextMenu(null)
                  if (getLastFocusedEditor() === editor) setLastFocusedEditor(null)
                })

                applyGutterDecorations()
                editor.onDidChangeModelContent(() => {
                  if (debounceTimer) clearTimeout(debounceTimer)
                  debounceTimer = setTimeout(applyGutterDecorations, 300)
                })
              }}
            />
          </div>
        )
      ) : (
        <div className="h-full flex items-center justify-center">
          <p className="text-fg-subtle text-sm">Select a tab for this pane</p>
        </div>
      )}
      </div>
    </div>
  )
}
