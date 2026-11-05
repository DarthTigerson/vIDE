import { useCallback, useEffect, useState } from 'react'
import { useVcloakStore } from '@/stores/vcloakStore'
import type { VcloakConfig, VcloakMode, VcloakPreviewResult, VcloakRepoRow, VcloakRule, VcloakState } from '../../../electron/vcloak/types'
import { Switch } from '@/components/ui/Toggle'
import { useFileStore } from '@/stores/fileStore'
import { FeatureBlock, SettingRow } from './FeatureBlock'

const INPUT = 'w-full rounded border border-border bg-white/5 px-2 py-1 text-sm text-fg outline-none focus:border-accent'
const BTN = 'rounded border border-border bg-white/5 px-2.5 py-1 text-xs text-fg hover:bg-white/10 disabled:opacity-50'

// Text field that saves on blur or Enter, not on every key.
function CommitInput({ value, onCommit, label, placeholder }: {
  value: string
  onCommit: (v: string) => void
  label: string
  placeholder?: string
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  const commit = () => { if (draft !== value) onCommit(draft) }
  return (
    <input
      aria-label={label}
      className={INPUT}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
    />
  )
}

type Section = 'root' | 'hidden' | 'rules' | 'exceptions'

// Error text shown directly under the section where an action failed
function SectionError({ id, message }: { id: Section; message: string | undefined }) {
  if (!message) return null
  return <p role="alert" data-testid={`error-${id}`} className="mt-1 text-xs text-red-500">{message}</p>
}

const MODES: { value: VcloakMode; label: string; help: string }[] = [
  { value: 'all', label: 'Cloak everything', help: 'Recommended. Every repository under the company root is hidden, and new repositories are protected automatically.' },
  { value: 'all-except', label: 'Cloak everything except', help: 'Everything is hidden apart from the paths you list under Exceptions.' },
  { value: 'selective', label: 'Cloak only chosen repos', help: 'Only the paths you list, each with its own decoy, are hidden.' },
]

function fmtTime(ms: number | null): string {
  return ms ? new Date(ms).toLocaleString() : 'never'
}

export function VcloakSettingsPage() {
  const [state, setLocalState] = useState<VcloakState | null>(null)
  // Keep the app icon and sidebar panel in sync with every new state.
  const setState = useCallback((s: VcloakState) => {
    setLocalState(s)
    useVcloakStore.getState().setState(s)
  }, [])
  const [repos, setRepos] = useState<VcloakRepoRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [sectionErrors, setSectionErrors] = useState<Partial<Record<Section, string>>>({})
  const [busy, setBusy] = useState(false)
  const [testText, setTestText] = useState('')
  const [preview, setPreview] = useState<VcloakPreviewResult | null>(null)
  const [newRule, setNewRule] = useState<VcloakRule>({ real: '', decoy: '' })
  const [newException, setNewException] = useState('')
  const [newHidden, setNewHidden] = useState('')
  const [newHiddenDecoy, setNewHiddenDecoy] = useState('')
  const projectRoot = useFileStore((s) => s.projectRoot)

  const loadRepos = useCallback(async () => {
    try { setRepos((await window.api.vcloakListRepos()) ?? []) } catch { setRepos([]) }
  }, [])

  useEffect(() => {
    let alive = true
    void window.api.vcloakGetState()
      .then(async (s) => {
        if (!alive) return
        setState(s)
        // Fill the table for the open project before any Claude session ran
        if (s.config.root && projectRoot && !s.sources.workspaces.includes(projectRoot)) {
          const scanned = await window.api.vcloakRescan(projectRoot)
          if (alive) setState(scanned)
        }
        if (alive) await loadRepos()
      })
      .catch((e) => { if (alive) setError(String(e?.message ?? e)) })
    return () => { alive = false }
  }, [loadRepos, projectRoot])

  // Returns true when the change was saved. A failure is shown under the
  // section it came from, or at the top when it has no section.
  const apply = useCallback(async (patch: Partial<VcloakConfig>, section?: Section): Promise<boolean> => {
    setBusy(true)
    const fail = (message: string) => {
      if (section) setSectionErrors((prev) => ({ ...prev, [section]: message }))
      else setError(message)
    }
    try {
      const res = await window.api.vcloakSetConfig(patch)
      if (res.ok) { setState(res.state); setError(null); setSectionErrors({}); await loadRepos(); return true }
      fail(res.error)
    } catch (e) {
      fail(String((e as Error)?.message ?? e))
    } finally { setBusy(false) }
    return false
  }, [loadRepos])

  if (!state) {
    return (
      <div className="h-full overflow-auto bg-panel p-6">
        <h1 className="mb-1 text-base font-semibold text-fg">vCloak</h1>
        {error ? <p className="text-xs text-red-500">{error}</p> : <p className="text-sm text-fg-muted">Loading...</p>}
      </div>
    )
  }

  const cfg = state.config
  const gw = state.gateway
  const gatewayText = gw.error ? `Error: ${gw.error}` : gw.running ? `Running on 127.0.0.1:${gw.port}` : 'Stopped'

  const toggleRepo = async (row: VcloakRepoRow, on: boolean) => {
    if (cfg.mode === 'all') {
      if (!on) await apply({ mode: 'all-except', exceptions: [...new Set([...cfg.exceptions, row.remote])] })
    } else if (cfg.mode === 'all-except') {
      await apply({ exceptions: on ? cfg.exceptions.filter((x) => x !== row.remote) : [...new Set([...cfg.exceptions, row.remote])] })
    } else if (on) {
      const decoy = await window.api.vcloakGenerateDecoy(row.remote)
      await apply({ rules: [...cfg.rules.filter((r) => r.real !== row.remote), { real: row.remote, decoy }] })
    } else {
      await apply({ rules: cfg.rules.filter((r) => r.real !== row.remote) })
    }
  }

  const setRule = (i: number, part: Partial<VcloakRule>) =>
    apply({ rules: cfg.rules.map((r, j) => (j === i ? { ...r, ...part } : r)) }, 'rules')

  const generateFor = async (i: number) => {
    const decoy = await window.api.vcloakGenerateDecoy(cfg.rules[i].real)
    await setRule(i, { decoy })
  }

  const addRule = async () => {
    const real = newRule.real.trim()
    if (!real) return
    const decoy = newRule.decoy.trim() || (await window.api.vcloakGenerateDecoy(real))
    if (await apply({ rules: [...cfg.rules, { real, decoy }] }, 'rules')) setNewRule({ real: '', decoy: '' })
  }

  const addException = async () => {
    const v = newException.trim()
    if (!v || cfg.exceptions.includes(v)) return
    if (await apply({ exceptions: [...cfg.exceptions, v] }, 'exceptions')) setNewException('')
  }

  const addHidden = async () => {
    const v = newHidden.trim()
    if (!v) return
    const d = newHiddenDecoy.trim()
    const patch: Partial<VcloakConfig> = { hiddenFolders: [...cfg.hiddenFolders, v] }
    if (d) patch.hiddenDecoys = { ...cfg.hiddenDecoys, [v]: d }
    if (await apply(patch, 'hidden')) { setNewHidden(''); setNewHiddenDecoy('') }
  }

  const setHiddenDecoy = (folder: string, decoy: string) =>
    apply({ hiddenDecoys: { ...cfg.hiddenDecoys, [folder]: decoy.trim() } }, 'hidden')

  const runPreview = async () => {
    try { setPreview(await window.api.vcloakPreview(testText)) } catch (e) { setError(String((e as Error)?.message ?? e)) }
  }

  const rescan = async () => {
    setBusy(true)
    try { setState(await window.api.vcloakRescan(projectRoot ?? undefined)); await loadRepos() } finally { setBusy(false) }
  }

  const resetAliases = async () => {
    if (!window.confirm('Reset the alias table? Old conversations may show aliases (made-up names) instead of the real names afterwards.')) return
    setState(await window.api.vcloakClearAliases())
    await loadRepos()
  }

  const src = state.sources
  const reversible = preview ? preview.restored === testText : false

  return (
    <div className="h-full overflow-auto bg-panel p-6">
      <div className="max-w-[1000px]">
        <h1 className="mb-1 text-base font-semibold text-fg">vCloak</h1>
        <p className="mb-4 text-sm text-fg-muted">Keeps your company's repository names out of AI provider logs.</p>

        <FeatureBlock
          title="vCloak"
          description="Hides company repository names and paths from AI provider logs. Names are swapped for made-up aliases before a Claude message leaves this Mac, and swapped back in the reply. It applies to new Claude sessions only. Bridge and Llama sessions, and terminals outside vIDE, are not covered."
          toggle={{
            checked: cfg.enabled,
            onChange: (v) => void apply({ enabled: v }),
            label: 'Enable vCloak',
            disabled: busy || (!state.encryptionAvailable && !cfg.enabled),
          }}
          dimWhenOff={false}
        >
          {!state.encryptionAvailable && (
            <p className="text-xs text-red-500">vCloak needs the macOS Keychain, which is not available here, so it cannot be turned on.</p>
          )}
          <p className="mt-1 text-xs text-fg-muted">Gateway: {gatewayText}</p>
          {error && <p role="alert" className="mt-1 text-xs text-red-500">{error}</p>}
        </FeatureBlock>

        <FeatureBlock title="Company root" description="The top GitLab group your repositories live under.">
          <SettingRow label="Root" stacked>
            <CommitInput label="Company root" value={cfg.root} placeholder="acme-corp" onCommit={(v) => void apply({ root: v.trim() }, 'root')} />
          </SettingRow>
          <p className="text-xs text-fg-muted">Just the GitLab group name, for example acme-corp. A pasted GitLab link also works.</p>
          <SectionError id="root" message={sectionErrors.root} />
        </FeatureBlock>

        <FeatureBlock title="Hidden local folders" description="The folder itself and every folder name below it are swapped for realistic made-up names, down to each project folder. File names inside projects stay visible. Type your own replacement for the folder, or leave it blank and vCloak picks one.">
          <div className="space-y-2">
            {cfg.hiddenFolders.map((p) => (
              <div key={p} className="flex items-center gap-2">
                <span className="flex-1 break-all text-sm text-fg">{p}</span>
                <span className="text-xs text-fg-muted">shown as</span>
                <div className="flex-1">
                  <CommitInput label={`Shown to AI as, for ${p}`} value={cfg.hiddenDecoys?.[p] ?? ''} placeholder="Made-up name picked for you" onCommit={(v) => void setHiddenDecoy(p, v)} />
                </div>
                <button type="button" className={BTN} aria-label={`Remove hidden folder ${p}`} onClick={() => void apply({ hiddenFolders: cfg.hiddenFolders.filter((q) => q !== p) }, 'hidden')}>Remove</button>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <input
                aria-label="New hidden folder"
                className={INPUT}
                placeholder="/Users/you/Documents"
                value={newHidden}
                onChange={(e) => setNewHidden(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void addHidden() }}
              />
              <input
                aria-label="New hidden folder shown as"
                className={INPUT}
                placeholder="Shown as (optional), e.g. /Users/you/Documents/acme-corp"
                value={newHiddenDecoy}
                onChange={(e) => setNewHiddenDecoy(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void addHidden() }}
              />
              <button type="button" className={BTN} aria-label="Add hidden folder" onClick={() => void addHidden()}>Add</button>
            </div>
            <SectionError id="hidden" message={sectionErrors.hidden} />
          </div>
        </FeatureBlock>

        <FeatureBlock title="Mode" description="Choose which repositories are hidden.">
          <div role="radiogroup" aria-label="Mode" className="space-y-2">
            {MODES.map((m) => (
              <label key={m.value} className="flex cursor-pointer items-start gap-2">
                <input
                  type="radio"
                  name="vcloak-mode"
                  aria-label={m.label}
                  className="mt-1"
                  checked={cfg.mode === m.value}
                  onChange={() => void apply({ mode: m.value })}
                />
                <span>
                  <span className="text-sm text-fg">{m.label}</span>
                  <span className="block text-xs text-fg-muted">{m.help}</span>
                </span>
              </label>
            ))}
          </div>
        </FeatureBlock>

        <FeatureBlock title="Cloaked Repos" description="Every repository vCloak knows about and what the AI sees for it.">
          {repos.length === 0 ? (
            <p className="text-xs text-fg-muted">No repositories found yet. Check the company root, then press Rescan under Name sources.</p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-fg-muted">
                  <th className="py-1 pr-3 font-medium">Repository</th>
                  <th className="py-1 pr-3 font-medium">Local folder</th>
                  <th className="py-1 pr-3 font-medium">Shown to AI as</th>
                  <th className="py-1 font-medium">Cloaked</th>
                </tr>
              </thead>
              <tbody>
                {repos.map((r) => (
                  <tr key={r.remote} className="border-t border-border">
                    <td className="py-1 pr-3 text-fg break-all">{r.remote}</td>
                    <td className="py-1 pr-3 text-fg-muted break-all">{r.local ?? '-'}</td>
                    <td className="py-1 pr-3 text-fg-muted break-all">{r.alias ?? 'visible'}</td>
                    <td className="py-1">
                      <Switch label={`Cloak ${r.remote}`} checked={r.cloaked} disabled={busy} onChange={(v) => void toggleRepo(r, v)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </FeatureBlock>

        {cfg.mode === 'selective' && (
          <FeatureBlock title="Chosen paths and decoys" description="Each real path is replaced by its decoy. Press Generate for a random one.">
            <div className="space-y-2">
              {cfg.rules.map((r, i) => (
                <div key={`${i}-${r.real}`} className="flex items-center gap-2">
                  <CommitInput label={`Real path ${i + 1}`} value={r.real} onCommit={(v) => void setRule(i, { real: v.trim() })} />
                  <CommitInput label={`Decoy ${i + 1}`} value={r.decoy} onCommit={(v) => void setRule(i, { decoy: v.trim() })} />
                  <button type="button" className={BTN} aria-label={`Generate decoy ${i + 1}`} onClick={() => void generateFor(i)}>Generate</button>
                  <button type="button" className={BTN} aria-label={`Remove rule ${i + 1}`} onClick={() => void apply({ rules: cfg.rules.filter((_, j) => j !== i) }, 'rules')}>Remove</button>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <input aria-label="New real path" className={INPUT} placeholder="Real path" value={newRule.real} onChange={(e) => setNewRule({ ...newRule, real: e.target.value })} />
                <input aria-label="New decoy" className={INPUT} placeholder="Decoy (blank to generate)" value={newRule.decoy} onChange={(e) => setNewRule({ ...newRule, decoy: e.target.value })} />
                <button type="button" className={BTN} onClick={() => void addRule()}>Add</button>
              </div>
              <SectionError id="rules" message={sectionErrors.rules} />
            </div>
          </FeatureBlock>
        )}

        {cfg.mode === 'all-except' && (
          <FeatureBlock title="Exceptions" description="These paths stay visible to the AI.">
            <div className="space-y-2">
              {cfg.exceptions.map((x) => (
                <div key={x} className="flex items-center gap-2">
                  <span className="flex-1 break-all text-sm text-fg">{x}</span>
                  <button type="button" className={BTN} aria-label={`Remove exception ${x}`} onClick={() => void apply({ exceptions: cfg.exceptions.filter((y) => y !== x) }, 'exceptions')}>Remove</button>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <input
                  aria-label="New exception"
                  className={INPUT}
                  placeholder="Path to leave visible"
                  value={newException}
                  onChange={(e) => setNewException(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void addException() }}
                />
                <button type="button" className={BTN} onClick={() => void addException()}>Add</button>
              </div>
              <SectionError id="exceptions" message={sectionErrors.exceptions} />
            </div>
          </FeatureBlock>
        )}

        <FeatureBlock title="Options">
          <SettingRow label="Also hide the root name" description="Hides the company root itself, for example acme-corp.">
            <Switch label="Also hide the root name" checked={cfg.maskRoot} disabled={busy} onChange={(v) => void apply({ maskRoot: v })} />
          </SettingRow>
          <SettingRow label="Hide local workspace folders" description="Hides the folders on this Mac that hold company repositories.">
            <Switch label="Hide local workspace folders" checked={cfg.maskLocalFolders} disabled={busy} onChange={(v) => void apply({ maskLocalFolders: v })} />
          </SettingRow>
          <SettingRow label="Hide my Mac username in paths" description="Shows /Users/dev instead of your real user folder.">
            <Switch label="Hide my Mac username in paths" checked={cfg.maskUsername} disabled={busy} onChange={(v) => void apply({ maskUsername: v })} />
          </SettingRow>
          <SettingRow label="Block Claude if vCloak is not working" description="Recommended. Claude will not start rather than send real names unprotected.">
            <Switch label="Block Claude if vCloak is not working" checked={cfg.failClosed} disabled={busy} onChange={(v) => void apply({ failClosed: v })} />
          </SettingRow>
        </FeatureBlock>

        <FeatureBlock title="Name sources" description="Where vCloak learns your repository names from.">
          <ul className="space-y-0.5 text-xs text-fg-muted">
            <li>Graphify: {src.graphify.found ? `found, ${src.graphify.repos} repos, built ${fmtTime(src.graphify.builtAt)}` : 'not found'}</li>
            <li>ripgrep (file search tool): {src.ripgrep.repos} repos</li>
            <li>Total repos: {src.repos}</li>
            <li>Last scanned: {fmtTime(src.scannedAt)}</li>
            <li>Workspaces: {src.workspaces.length ? src.workspaces.join(', ') : 'none'}</li>
          </ul>
          <button type="button" className={`${BTN} mt-2`} disabled={busy} onClick={() => void rescan()}>Rescan</button>
        </FeatureBlock>

        <FeatureBlock title="Test" description="Type some text with a repository path to see what the AI would receive.">
          <textarea
            aria-label="Test text"
            className={`${INPUT} h-24 font-mono`}
            value={testText}
            onChange={(e) => { setTestText(e.target.value); setPreview(null) }}
          />
          <button type="button" className={`${BTN} mt-2`} onClick={() => void runPreview()}>Preview</button>
          {preview && (
            <div className="mt-2 space-y-1">
              <pre aria-label="Masked output" className="whitespace-pre-wrap break-all rounded border border-border bg-white/5 p-2 text-xs text-fg">{preview.masked}</pre>
              <span className={['inline-block rounded px-2 py-0.5 text-xs', reversible ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'].join(' ')}>
                {reversible ? 'Reversible' : 'Not reversible'}
              </span>
            </div>
          )}
        </FeatureBlock>

        <FeatureBlock title="Status">
          <ul className="space-y-0.5 text-xs text-fg-muted">
            <li>Requests: {state.stats.requests}</li>
            <li>Masked: {state.stats.masked}</li>
            <li>Blocked: {state.stats.blocked}</li>
            <li>Aliases: {state.aliasCount}</li>
          </ul>
          <button type="button" className={`${BTN} mt-2`} onClick={() => void resetAliases()}>Reset alias table</button>
        </FeatureBlock>
      </div>
    </div>
  )
}
