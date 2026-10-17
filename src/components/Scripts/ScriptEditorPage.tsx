import { useEffect, useRef, useState } from 'react'
import MonacoEditor, { type BeforeMount } from '@monaco-editor/react'
import type { ScriptPatch } from '@/types/api'
import { useScriptsStore } from '@/stores/scriptsStore'
import { runScriptInNewTerminal } from '@/lib/runScript'
import { Switch } from '@/components/ui/Toggle'

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

  return (
    <div className="h-full flex flex-col bg-panel overflow-hidden">
      <div className="shrink-0 p-4 pb-3 flex flex-col gap-2 border-b border-border">
        <div className="flex items-center gap-2">
          <input
            value={draft.title}
            onChange={(e) => change({ title: e.target.value })}
            placeholder="Untitled script"
            aria-label="Script title"
            className="flex-1 min-w-0 bg-transparent text-base font-semibold text-fg placeholder:text-fg-subtle focus:outline-none"
          />
          <button
            type="button"
            onClick={async () => {
              await flush()
              const latest = useScriptsStore.getState().scripts.find((x) => x.id === scriptId)
              if (latest) runScriptInNewTerminal(latest)
            }}
            className="shrink-0 px-3 py-1 text-xs rounded-lg bg-accent text-on-accent font-semibold hover:opacity-90"
          >
            ▶ Run
          </button>
        </div>
        <textarea
          value={draft.description}
          onChange={(e) => change({ description: e.target.value })}
          placeholder="What this does and when to use it (Claude reads this too)"
          aria-label="Script description"
          rows={2}
          className="w-full resize-y rounded border border-border bg-bg px-2 py-1.5 text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus:ring-1 focus:ring-accent/70"
        />
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <div className="flex items-center gap-2 text-xs text-fg-muted">
            <Switch checked={draft.shareOutput} onChange={(value) => change({ shareOutput: value })} label="Share output with Claude" />
            Share output with Claude
            <span className="text-fg-subtle">{draft.shareOutput ? '' : '(Claude only hears success or failure)'}</span>
          </div>
          <p className="text-xs text-fg-subtle">
            Success = exit status of the last command; chain with <code className="font-mono">&&</code> to stop at the first failure.
          </p>
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-fg-subtle">
            <span>Used in:</span>
            {tags.map((root) => (
              <span key={root} className="flex items-center gap-1 rounded bg-white/5 pl-1.5 pr-0.5 py-0.5 font-mono text-fg-muted">
                {root.split('/').pop() || root}
                <button
                  type="button"
                  aria-label={`Remove ${root}`}
                  title={root}
                  onClick={() => void useScriptsStore.getState().removeTag(scriptId, root)}
                  className="w-4 h-4 flex items-center justify-center rounded hover:bg-white/10 hover:text-fg"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
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
            padding: { top: 8 },
            automaticLayout: true,
          }}
        />
      </div>
    </div>
  )
}
