import { useCallback, useEffect, useMemo, useState } from 'react'
import { useFileStore } from '@/stores/fileStore'
import { useHiddenFoldersStore } from '@/stores/hiddenFoldersStore'
import { Switch } from '@/components/ui/Toggle'
import { HIDDEN_FOLDER_PRESETS, gitignorePattern, isValidHiddenName, type HiddenFolderPreset } from '@/lib/hiddenFolders'
import { SettingRow } from './FeatureBlock'

type Status = { repo: false } | { repo: true; ignored: string[] } | null

// Gitignore state for the open project, checked through git so rules from
// anywhere git honors count. null while checking or with no project open.
function useGitignoreStatus(patterns: string[]) {
  const projectRoot = useFileStore((s) => s.projectRoot)
  const [status, setStatus] = useState<Status>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const key = patterns.join('\n')

  const refresh = useCallback(async () => {
    if (!projectRoot) return setStatus(null)
    try {
      setStatus(await window.api.gitignoreStatus(projectRoot, key ? key.split('\n') : []))
    } catch {
      setStatus({ repo: false })
    }
  }, [projectRoot, key])

  useEffect(() => {
    setStatus(null)
    setError(null)
    refresh()
  }, [refresh])

  const setIgnored = async (pattern: string, value: boolean) => {
    if (!projectRoot) return
    setBusy(true)
    setError(null)
    try {
      const result = value
        ? await window.api.gitignoreAdd(projectRoot, pattern)
        : await window.api.gitignoreRemove(projectRoot, pattern)
      if (!result.ok) setError(result.output)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return { projectRoot, status, busy, error, setIgnored }
}

function GitignoreNote({ status, error }: { status: Status; error: string | null }) {
  return (
    <>
      <p className="mt-1 max-w-[460px] rounded border border-border p-2 text-xs text-fg-muted">
        {status && !status.repo
          ? "This project isn't a git repository, so there's no .gitignore to update. If you put it under git later, add these to its .gitignore to keep them out of the repo."
          : "Gitignore adds the entry to this project's .gitignore. You can also do this manually. Turning it off only removes that exact entry; a broader rule elsewhere will keep it ignored."}
      </p>
      {error && (
        <p className="mt-1 max-w-[460px] whitespace-pre-wrap rounded border border-red-400/30 p-2 text-xs text-red-400">
          Couldn't update .gitignore: {error}
        </p>
      )}
    </>
  )
}

// For a tool's own settings page (Git, Claude): the same hide/gitignore
// settings as Settings > Site Tree, so changing either updates both.
export function ToolFolderRows({ name }: { name: string }) {
  const preset = HIDDEN_FOLDER_PRESETS.find((p) => p.name === name)!
  const hidden = useHiddenFoldersStore((s) => s.hidden.includes(name))
  const setHidden = useHiddenFoldersStore((s) => s.setHidden)
  const pattern = gitignorePattern(preset.name, preset.isDirectory)
  const patterns = useMemo(() => (preset.gitignore ? [pattern] : []), [preset.gitignore, pattern])
  const { projectRoot, status, busy, error, setIgnored } = useGitignoreStatus(patterns)

  return (
    <>
      <SettingRow label="Hide from the file tree" description={`Hides ${name} from the Explorer. The files stay on disk.`}>
        <Switch label={`Hide ${name} from the file tree`} checked={hidden} onChange={(v) => setHidden(name, v)} />
      </SettingRow>
      {preset.gitignore && (
        <>
          <SettingRow label={`Gitignore ${name}`} description={`Adds ${pattern} to this project's .gitignore.`}>
            <Switch
              label={`Gitignore ${name}`}
              checked={!!status?.repo && status.ignored.includes(pattern)}
              onChange={(v) => setIgnored(pattern, v)}
              disabled={!projectRoot || busy || !status?.repo}
            />
          </SettingRow>
          <GitignoreNote status={status} error={error} />
        </>
      )}
    </>
  )
}

// Settings > Site Tree: every preset plus the user's own names, each with a
// hide toggle and (where it makes sense) a gitignore toggle.
export function HiddenFoldersList() {
  const hidden = useHiddenFoldersStore((s) => s.hidden)
  const setHidden = useHiddenFoldersStore((s) => s.setHidden)
  const custom = useHiddenFoldersStore((s) => s.custom)
  const addCustom = useHiddenFoldersStore((s) => s.addCustom)
  const removeCustom = useHiddenFoldersStore((s) => s.removeCustom)
  const [draft, setDraft] = useState('')

  const entries = useMemo<(HiddenFolderPreset & { custom?: boolean })[]>(() => [
    ...HIDDEN_FOLDER_PRESETS,
    ...custom
      .filter((name) => !HIDDEN_FOLDER_PRESETS.some((p) => p.name === name))
      // isDirectory false: gitignore the plain name, which matches a file or a folder.
      .map((name) => ({ name, description: 'Added by you', isDirectory: false, gitignore: true, custom: true })),
  ], [custom])

  const patterns = useMemo(
    () => entries.filter((e) => e.gitignore).map((e) => gitignorePattern(e.name, e.isDirectory)),
    [entries],
  )
  const { projectRoot, status, busy, error, setIgnored } = useGitignoreStatus(patterns)

  const trimmed = draft.trim()
  const canAdd = isValidHiddenName(trimmed) && !entries.some((e) => e.name === trimmed)
  const add = () => {
    if (!canAdd) return
    addCustom(trimmed)
    setHidden(trimmed, true)
    setDraft('')
  }

  return (
    <div className="max-w-[640px]">
      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-6 gap-y-2 text-sm">
        <span className="text-xs text-fg-muted">Folder</span>
        <span className="text-xs text-fg-muted">Hide</span>
        <span className="text-xs text-fg-muted">Gitignore</span>
        {entries.map((entry) => {
          const pattern = gitignorePattern(entry.name, entry.isDirectory)
          return (
            <div key={entry.name} className="contents">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <code className="rounded bg-white/10 px-1 py-0.5 text-[0.95em] text-fg">{entry.name}</code>
                  {entry.custom && (
                    <button
                      type="button"
                      className="text-xs text-fg-muted hover:text-red-400"
                      onClick={() => removeCustom(entry.name)}
                      aria-label={`Remove ${entry.name}`}
                    >
                      Remove
                    </button>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-fg-muted">{entry.description}</div>
              </div>
              <Switch
                label={`Hide ${entry.name} from the file tree`}
                checked={hidden.includes(entry.name)}
                onChange={(v) => setHidden(entry.name, v)}
              />
              {entry.gitignore ? (
                <Switch
                  label={`Gitignore ${entry.name}`}
                  checked={!!status?.repo && status.ignored.includes(pattern)}
                  onChange={(v) => setIgnored(pattern, v)}
                  disabled={!projectRoot || busy || !status?.repo}
                />
              ) : (
                <span className="text-center text-xs text-fg-muted" title="Not something you'd normally gitignore">n/a</span>
              )}
            </div>
          )
        })}
      </div>

      <div className="mt-4 flex items-center gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add() }}
          placeholder="Add a folder or file name, e.g. .terraform"
          aria-label="Folder or file name to add"
          className="h-8 w-72 rounded border border-border bg-transparent px-2 text-sm text-fg placeholder:text-fg-muted focus:border-fg-subtle focus:outline-none"
        />
        <button
          type="button"
          className="h-8 rounded border border-border px-3 text-sm text-fg transition-colors hover:border-fg-subtle disabled:pointer-events-none disabled:opacity-40"
          disabled={!canAdd}
          onClick={add}
        >
          Add
        </button>
      </div>

      <GitignoreNote status={status} error={error} />
    </div>
  )
}
