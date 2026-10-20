import { useEffect, useState } from 'react'
import { Switch } from '@/components/ui/Toggle'
import { Select } from '@/components/ui/Select'
import { MODEL_CATALOG, recommendedModelId, type ManagedModelId } from '../../../electron/autocomplete/catalog'
import { useAutocompleteSettingsStore, type AutocompleteModelChoice } from '@/stores/autocompleteSettingsStore'
import { useAutocompleteRuntimeStore } from '@/stores/autocompleteRuntimeStore'
import { formatMemory } from '@/lib/memoryBreakdown'
import type { AutocompleteRuntimeState } from '@/types/api'
import { FeatureBlock } from './FeatureBlock'

const FITS = '#8fbf6a'
const TOO_BIG = '#e0805c'
const MANAGED_IDS = Object.keys(MODEL_CATALOG) as ManagedModelId[]

const inputClass = 'w-full rounded-lg border border-border bg-bg px-2 py-1 text-sm text-fg focus:border-accent/60 focus:outline-none'
const primaryButton = 'shrink-0 whitespace-nowrap rounded-lg bg-accent px-3.5 py-1.5 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:opacity-40'
const secondaryButton = 'shrink-0 whitespace-nowrap rounded-lg border border-border px-3.5 py-1.5 text-sm text-fg transition-colors hover:border-fg-subtle disabled:opacity-40'

function percent(progress: { received: number; total: number } | null): number {
  if (!progress || progress.total <= 0) return 0
  return Math.min(100, Math.floor((progress.received / progress.total) * 100))
}

// The model cards: each shows its download size, RAM need and how much of the
// RAM free right now it would take. A managed model that won't fit can't be
// picked; Custom is always available.
function ModelCard({ title, sub, recommended, selected, disabled, bar, onPick }: {
  title: string
  sub: string
  recommended?: boolean
  selected: boolean
  disabled?: boolean
  bar?: { pct: number; fits: boolean }
  onPick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled}
      aria-pressed={selected}
      className={[
        'flex min-h-24 flex-col items-start rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45',
        selected ? 'border-accent bg-sidebar' : 'border-border bg-bg hover:border-fg-subtle',
      ].join(' ')}
    >
      <span className="flex w-full items-center justify-between gap-1.5">
        <span className="text-[0.8125rem] font-semibold text-fg">{title}</span>
        {recommended && (
          <span className="rounded bg-accent px-1.5 py-px text-[0.625rem] font-semibold text-on-accent">Recommended</span>
        )}
      </span>
      <span className="mt-0.5 text-xs text-fg-muted">{sub}</span>
      {bar && (
        <span className="mt-2.5 w-full">
          <span className="block h-1.5 overflow-hidden rounded-full bg-tab-bar">
            <span className="block h-1.5" style={{ width: `${bar.pct}%`, background: bar.fits ? FITS : TOO_BIG }} />
          </span>
          <span className="mt-1 block text-[0.6875rem]" style={{ color: bar.fits ? FITS : TOO_BIG }}>
            {bar.fits ? `Uses ${bar.pct}% of free RAM` : 'Needs more RAM than is free'}
          </span>
        </span>
      )}
    </button>
  )
}

function statusFor(state: AutocompleteRuntimeState, label: string, isServer: boolean): string {
  switch (state.phase) {
    case 'installing': return `Getting llama.cpp… ${percent(state.progress)}%`
    case 'downloading': return `Downloading ${label}… ${percent(state.progress)}%`
    case 'starting': return isServer ? 'Connecting…' : `Starting ${label}…`
    case 'running': return isServer
      ? 'Connected · suggestions are live'
      : `Running · ~${formatMemory(state.ramBytes ?? 0)} RAM · suggestions are live`
    case 'error': return state.error?.message ?? 'Something went wrong'
    default:
      if (isServer) return 'Not connected'
      if (!state.modelOnDisk) return `${label} isn’t downloaded yet.`
      return state.phase === 'stopped' ? `${label} is stopped.` : `${label} found on disk · ready to start`
  }
}

// One button that always says what it will do next for the current phase.
function ActionButton({ state, downloadLabel, isServer }: { state: AutocompleteRuntimeState; downloadLabel: string; isServer: boolean }) {
  const start = (force?: boolean) => { void (force ? window.api.autocompleteStart(true) : window.api.autocompleteStart()) }
  const stop = () => { void window.api.autocompleteStop() }
  switch (state.phase) {
    case 'installing':
    case 'downloading':
      return <button type="button" className={secondaryButton} onClick={stop}>Cancel</button>
    case 'starting':
      return <button type="button" className={secondaryButton} disabled>{isServer ? 'Connecting…' : 'Starting…'}</button>
    case 'running':
      return <button type="button" className={secondaryButton} onClick={stop}>{isServer ? 'Disconnect' : 'Stop'}</button>
    case 'error':
      return state.error?.kind === 'no-fit'
        ? <button type="button" className={secondaryButton} onClick={() => start(true)}>Start anyway</button>
        : <button type="button" className={primaryButton} onClick={() => start()}>Retry</button>
    default:
      if (isServer) return <button type="button" className={primaryButton} onClick={() => start()}>Connect</button>
      return state.modelOnDisk
        ? <button type="button" className={primaryButton} onClick={() => start()}>Start</button>
        : <button type="button" className={primaryButton} onClick={() => start()}>{downloadLabel}</button>
  }
}

function CustomFields({ freeBytes }: { freeBytes: number }) {
  const s = useAutocompleteSettingsStore()
  const ramBytes = useAutocompleteRuntimeStore((r) => r.state.source?.kind === 'gguf' ? r.state.ramBytes : null)
  const tab = (on: boolean) => [
    'rounded-md px-3 py-1 text-xs transition-colors',
    on ? 'bg-tab-bar text-fg' : 'text-fg-muted hover:text-fg',
  ].join(' ')

  const browse = async () => {
    const path = await window.api.openFile({ filters: [{ name: 'GGUF model', extensions: ['gguf'] }] })
    if (path) s.setGgufPath(path)
  }

  return (
    <div className="mt-3.5 flex flex-col gap-2.5">
      <div className="flex gap-1 self-start rounded-lg border border-border bg-bg p-0.5">
        <button type="button" className={tab(s.customKind === 'gguf')} aria-pressed={s.customKind === 'gguf'} onClick={() => s.setCustomKind('gguf')}>GGUF file</button>
        <button type="button" className={tab(s.customKind === 'server')} aria-pressed={s.customKind === 'server'} onClick={() => s.setCustomKind('server')}>Running server</button>
      </div>
      {s.customKind === 'gguf' ? (
        <>
          <label htmlFor="autocomplete-gguf" className="text-sm text-fg">Model file</label>
          <div className="flex gap-2">
            <input id="autocomplete-gguf" className={inputClass} value={s.ggufPath} placeholder="~/models/my-coder.gguf" onChange={(e) => s.setGgufPath(e.target.value)} />
            <button type="button" className={secondaryButton} onClick={browse}>Browse…</button>
          </div>
          <p className="text-xs text-fg-muted">Any fill-in-the-middle model. vIDE starts it with llama-server; add your own flags below.</p>
          {ramBytes !== null && ramBytes > freeBytes && (
            <p className="text-xs" style={{ color: TOO_BIG }}>Needs ~{formatMemory(ramBytes)} RAM, {formatMemory(freeBytes)} free. It may not load.</p>
          )}
          <input aria-label="Extra llama-server flags" className={`${inputClass} font-mono`} value={s.extraArgs} placeholder="-t 4 --ctx-size 4096" onChange={(e) => s.setExtraArgs(e.target.value)} />
        </>
      ) : (
        <>
          <div className="flex gap-2">
            <input aria-label="Server URL" className={inputClass} value={s.serverUrl} onChange={(e) => s.setServerUrl(e.target.value)} />
            <div className="w-56 shrink-0">
              <Select
                ariaLabel="API"
                value={s.serverApi}
                onChange={(v) => s.setServerApi(v as 'infill' | 'openai')}
                options={[{ value: 'infill', label: 'llama.cpp /infill' }, { value: 'openai', label: 'OpenAI /v1/completions' }]}
              />
            </div>
          </div>
          <input aria-label="API key" type="password" className={inputClass} value={s.serverKey} placeholder="API key (optional)" onChange={(e) => s.setServerKey(e.target.value)} />
          <p className="text-xs text-fg-muted">vIDE won’t start or stop this server, and it won’t count in vIDE’s memory total.</p>
        </>
      )}
    </div>
  )
}

// Settings › Editor › Autocomplete (layout B of the approved mockups): pick a
// model sized to this machine, set it up with one button, and keep it under
// control from here or the footer.
export function AutocompleteSection() {
  const s = useAutocompleteSettingsStore()
  const state = useAutocompleteRuntimeStore((r) => r.state)
  const [mem, setMem] = useState<{ totalBytes: number; usedBytes: number } | null>(null)

  useEffect(() => {
    window.api.getSystemMemoryUsage().then(setMem).catch(() => {})
  }, [state.phase])

  const freeBytes = mem ? Math.max(0, mem.totalBytes - mem.usedBytes) : 0
  const recommended = mem ? recommendedModelId(mem.totalBytes) : 'qwen-1.5b'
  const selected: AutocompleteModelChoice = s.model === 'recommended' ? recommended : s.model
  const pick = (choice: AutocompleteModelChoice) => s.setModel(choice === recommended ? 'recommended' : choice)

  const isCustom = selected === 'custom'
  const isServer = isCustom && s.customKind === 'server'
  const model = isCustom ? null : MODEL_CATALOG[selected]
  const label = model?.label ?? 'The model'
  const busy = state.phase === 'installing' || state.phase === 'downloading'

  return (
    <FeatureBlock
      title="Autocomplete"
      description="Grey ghost-text suggestions as you type, from a small coding model running on this machine. Press Tab to accept."
      toggle={{ checked: s.enabled, onChange: s.setEnabled }}
    >
      <div className="max-w-[560px] pt-1">
        {mem && (
          <p className="mb-2 text-xs text-fg-muted">This Mac: {formatMemory(mem.totalBytes)}, {formatMemory(freeBytes)} free right now</p>
        )}
        <div className="grid grid-cols-2 gap-2.5">
          {MANAGED_IDS.map((id) => {
            const m = MODEL_CATALOG[id]
            const fits = m.ramBytes <= freeBytes
            const pct = freeBytes > 0 ? Math.min(100, Math.round((m.ramBytes / freeBytes) * 100)) : 100
            return (
              <ModelCard
                key={id}
                title={m.label}
                sub={`${formatMemory(m.bytes)} download · ~${formatMemory(m.ramBytes)} RAM`}
                recommended={id === recommended}
                selected={selected === id}
                disabled={!!mem && !fits && selected !== id}
                bar={mem ? { pct, fits } : undefined}
                onPick={() => pick(id)}
              />
            )
          })}
          <ModelCard
            title="Custom"
            sub="Your own GGUF file or a server you already run"
            selected={isCustom}
            onPick={() => pick('custom')}
          />
        </div>

        <div className="mt-3.5 flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-fg-muted">{statusFor(state, label, isServer)}</p>
            {busy && (
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-tab-bar">
                <div className="h-1 bg-accent" style={{ width: `${percent(state.progress)}%` }} />
              </div>
            )}
          </div>
          <ActionButton
            state={state}
            isServer={isServer}
            downloadLabel={`Download & start${model ? ` (${formatMemory(model.bytes)})` : ''}`}
          />
        </div>

        <div className="mt-3 flex items-center justify-between gap-4 border-t border-border pt-3">
          <div>
            <div className="text-sm text-fg">Start with vIDE</div>
            <div className="mt-0.5 text-xs text-fg-muted">Load the model when vIDE opens. Off: start it from the footer when you need it.</div>
          </div>
          <Switch label="Start with vIDE" checked={s.autoStart} onChange={s.setAutoStart} />
        </div>

        <div className="mt-3 flex items-center justify-between gap-4 border-t border-border pt-3">
          <div>
            <div className="text-sm text-fg">Project context</div>
            <div className="mt-0.5 text-xs text-fg-muted">Experimental. Also sends definitions from the project's graphify graph and matching parts of open tabs. Adds about 0.2s per suggestion.</div>
          </div>
          <Switch label="Project context" checked={s.projectContext} onChange={s.setProjectContext} />
        </div>

        {isCustom && <CustomFields freeBytes={freeBytes} />}
      </div>
    </FeatureBlock>
  )
}
