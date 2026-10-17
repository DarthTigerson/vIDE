import { useEffect, useRef, useState } from 'react'
import MonacoEditor, { type BeforeMount } from '@monaco-editor/react'
import type { ScriptPatch } from '@/types/api'
import { useScriptsStore } from '@/stores/scriptsStore'
import { runScriptInNewTerminal } from '@/lib/runScript'
import { Switch } from '@/components/ui/Toggle'
import { ScriptsIcon } from '@/components/ActivityBar/ActivityBar'

// A bordered, tinted box around the name and description so they read as
// editable fields at rest, not as headings.
const fieldClass =
  '-ml-2.5 flex items-center rounded-lg border border-border bg-white/[0.03] px-2.5 cursor-text transition-colors hover:border-white/20 focus-within:border-accent'

function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-fg-subtle">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  )
}

function FolderIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  )
}

const SAVE_DELAY_MS = 500
// One shared empty list: a fresh `[]` from the selector on every read makes
// zustand 5 see a new value each render and loop until React gives up.
const NO_TAGS: string[] = []

// A script's own tab: title, description (read by humans and Claude), the
// "share output with Claude" switch, the commands, and the projects it has
// been run in. Edits save on a short debounce; Run saves first.
export function ScriptEditorPage({ scriptId, monacoTheme, beforeMount, fontSize, font }: {
  scriptId: string
  monacoTheme: string
  beforeMount: BeforeMount
  fontSize: number
  font: string
}) {
  const script = useScriptsStore((s) => s.scripts.find((x) => x.id === scriptId))
  const loaded = useScriptsStore((s) => s.loaded)
  const tags = useScriptsStore((s) => s.tags[scriptId] ?? NO_TAGS)
  const [draft, setDraft] = useState(() => (script ? {
    title: script.title, description: script.description, body: script.body, shareOutput: script.shareOutput,
  } : null))
  const pending = useRef<ScriptPatch>({})
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Opened before the store finished loading (e.g. a restored tab).
  useEffect(() => {
    if (!draft && script) {
      setDraft({ title: script.title, description: script.description, body: script.body, shareOutput: script.shareOutput })
    }
  }, [draft, script])

  async function flush(): Promise<void> {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const patch = pending.current
    pending.current = {}
    if (Object.keys(patch).length) await useScriptsStore.getState().update(scriptId, patch, { fromEditor: true }).catch(() => {})
  }

  useEffect(() => () => { void flush() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function change(patch: ScriptPatch) {
    setDraft((d) => (d ? { ...d, ...patch } : d))
    pending.current = { ...pending.current, ...patch }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void flush(), SAVE_DELAY_MS)
  }

  if (!script || !draft) {
    return (
      <div className="h-full flex items-center justify-center bg-panel text-sm text-fg-muted">
        {loaded ? 'This script was deleted.' : 'Loading…'}
      </div>
    )
  }

  async function run() {
    await flush()
    const latest = useScriptsStore.getState().scripts.find((x) => x.id === scriptId)
    if (latest) runScriptInNewTerminal(latest)
  }

  const lineCount = draft.body ? draft.body.replace(/\n+$/, '').split('\n').length : 0

  return (
    <div className="h-full flex flex-col gap-6 overflow-hidden bg-panel px-10 py-8">
      <div className="shrink-0 flex items-start gap-4">
        <div className="w-12 h-12 shrink-0 rounded-[10px] border border-accent/40 bg-accent/15 text-accent flex items-center justify-center [&>svg]:w-6 [&>svg]:h-6">
          <ScriptsIcon />
        </div>
        <div className="flex-1 min-w-0 max-w-[820px] flex flex-col gap-2.5">
          <label className={`${fieldClass} gap-2.5 py-1`}>
            <input
              value={draft.title}
              onChange={(e) => change({ title: e.target.value })}
              placeholder="Untitled script"
              aria-label="Script title"
              className="flex-1 min-w-0 bg-transparent py-0.5 text-[1.375rem] font-semibold tracking-tight text-fg placeholder:text-fg-subtle focus:outline-none"
            />
            <PencilIcon />
          </label>
          <label className={`${fieldClass} flex-col items-stretch gap-1.5 pt-2 pb-2.5`}>
            <span className="flex items-center gap-2 text-[0.6875rem] text-fg-subtle">
              Description
              <span aria-hidden="true">·</span>
              <span>Claude reads this to decide when to use it</span>
              <span className="flex-1" />
              <PencilIcon />
            </span>
            <textarea
              value={draft.description}
              onChange={(e) => change({ description: e.target.value })}
              placeholder="What this does and when to use it"
              aria-label="Script description"
              rows={2}
              className="w-full resize-none bg-transparent text-sm leading-relaxed text-fg-muted placeholder:text-fg-subtle focus:outline-none"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={() => void run()}
          className="shrink-0 h-9 px-4 rounded-lg bg-accent text-on-accent text-sm font-semibold flex items-center gap-2 hover:bg-accent/90"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" /></svg>
          Run in terminal
        </button>
      </div>

      <div className="shrink-0 flex flex-wrap items-center gap-2 text-xs">
        <span className="mr-1 text-fg-subtle">Used in</span>
        {tags.length === 0 && <span className="text-fg-subtle">not run in a project yet</span>}
        {tags.map((root) => (
          <span key={root} title={root} className="h-[1.625rem] flex items-center gap-1.5 rounded-full bg-white/5 pl-2.5 pr-1 text-fg-muted">
            <FolderIcon />
            {root.split('/').pop() || root}
            <button
              type="button"
              aria-label={`Remove ${root}`}
              onClick={() => void useScriptsStore.getState().removeTag(scriptId, root)}
              className="w-[1.125rem] h-[1.125rem] flex items-center justify-center rounded-full text-fg-subtle hover:bg-white/10 hover:text-fg"
            >
              ×
            </button>
          </span>
        ))}
        <span className="mx-2 h-[1.125rem] w-px bg-border" />
        <div className="flex items-center gap-2.5 text-fg-muted">
          <Switch checked={draft.shareOutput} onChange={(value) => change({ shareOutput: value })} label="Claude sees the output" />
          <span>Claude sees the output</span>
          {!draft.shareOutput && <span className="text-fg-subtle">(only success or failure)</span>}
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col overflow-hidden rounded-[10px] border border-border bg-bg">
        <div className="h-10 shrink-0 flex items-center gap-2.5 border-b border-border bg-white/[0.03] px-3.5 text-xs">
          <span className="font-semibold text-fg">Commands</span>
          <span className="text-fg-subtle">{lineCount === 1 ? '1 line' : `${lineCount} lines`}</span>
          <span className="flex-1" />
          <span className="truncate text-fg-subtle">
            Typed line by line · chain with <code className="font-mono">&&</code> to stop at the first failure
          </span>
        </div>
        <div className="flex-1 min-h-0">
          <MonacoEditor
            value={draft.body}
            language="shell"
            theme={monacoTheme}
            beforeMount={beforeMount}
            onChange={(value) => change({ body: value ?? '' })}
            options={{
              fontSize,
              fontFamily: font,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              padding: { top: 12 },
              automaticLayout: true,
            }}
          />
        </div>
      </div>
    </div>
  )
}
