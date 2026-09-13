import { useEffect, useRef, useState } from 'react'

// Strip quant suffixes and separators to derive a clean model name from a
// .gguf filename. e.g. "Qwen3.8-27B-UD-IQ4_XS.gguf" → "Qwen3.8 27B"
function deriveModelName(filePath: string): string {
  const base = filePath.split('/').pop() ?? filePath
  const noExt = base.replace(/\.gguf$/i, '')
  // Remove common quant/variant suffixes that trail after the model size
  const cleaned = noExt
    .replace(/[-_](UD[-_])?[IQ\d]+[KM_]\w*$/i, '')   // -IQ4_XS, -Q4_K_M, -UD-IQ4_XS
    .replace(/[-_](Instruct|Chat|GGUF|instruct|chat)$/i, '')
    .replace(/[-_.]+/g, ' ')
    .trim()
  return cleaned
}
import {
  CONTEXT_SIZE_OPTIONS,
  REASONING_EFFORTS,
  defaultLlamaModelConfig,
  useLlamaModelsStore,
  type LlamaModelConfig,
  type ReasoningEffort,
} from '@/stores/llamaModelsStore'
import { useLlamaStore } from '@/stores/llamaStore'

function NumberField({ id, label, value, onChange, step = 1 }: {
  id: string
  label: string
  value: number
  onChange: (v: number) => void
  step?: number
}) {
  return (
    <div className="flex flex-col gap-1.5 w-40 shrink-0">
      <label htmlFor={id} className="text-sm text-fg">{label}</label>
      <input
        id={id}
        type="number"
        min={0}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-8 px-2 text-sm text-fg bg-bg border border-border rounded-lg focus:outline-none focus:border-accent/60"
      />
    </div>
  )
}

function SelectField<T extends string | number>({ id, label, value, options, onChange, parse }: {
  id: string
  label: string
  value: T
  options: readonly T[]
  onChange: (v: T) => void
  // <select> always reports strings — number option lists need this to map
  // back.
  parse?: (raw: string) => T
}) {
  const toOption = (raw: string): T => (parse ? parse(raw) : (raw as T))
  return (
    <div className="flex flex-col gap-1.5 w-40 shrink-0">
      <label htmlFor={id} className="text-sm text-fg">{label}</label>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(toOption(e.target.value))}
          className="appearance-none w-full h-8 pl-2 pr-7 text-sm text-fg bg-bg border border-border rounded-lg focus:outline-none focus:border-accent/60"
        >
          {options.map((opt) => (
            <option key={String(opt)} value={String(opt)}>{opt}</option>
          ))}
        </select>
        <svg className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-fg-subtle" width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
    </div>
  )
}

function PathField({ id, label, value, onChange, placeholder, onBrowse, onBlur }: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  onBrowse?: () => void
  onBlur?: () => void
}) {
  return (
    <div className="flex flex-col gap-1.5 w-full">
      <label htmlFor={id} className="text-sm text-fg">{label}</label>
      <div className="flex gap-2">
        <input
          id={id}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder}
          spellCheck={false}
          className="flex-1 min-w-0 h-8 px-2 text-sm font-mono text-fg bg-bg border border-border rounded-lg focus:outline-none focus:border-accent/60"
        />
        {onBrowse && (
          <button
            type="button"
            onClick={onBrowse}
            className="shrink-0 h-8 px-3 rounded border border-border text-sm text-fg hover:border-fg-subtle transition-colors"
          >
            Browse
          </button>
        )}
      </div>
    </div>
  )
}

function ToggleField({ label, description, checked, onChange }: {
  label: string
  description?: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-center gap-3 cursor-pointer -mx-2 px-2 py-1 rounded-lg hover:bg-white/5 transition-colors">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={(e) => {
          e.preventDefault()
          onChange(!checked)
        }}
        className={[
          'relative shrink-0 w-9 h-5 rounded-full border transition-colors',
          checked ? 'bg-accent border-accent' : 'bg-fg-subtle border-fg-subtle',
        ].join(' ')}
      >
        <span
          className={[
            'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow ring-1 ring-black/10 transition-transform',
            checked ? 'translate-x-4' : 'translate-x-0',
          ].join(' ')}
        />
      </button>
      <span className="flex flex-col">
        <span className="text-sm text-fg">{label}</span>
        {description && <span className="text-xs text-fg-subtle">{description}</span>}
      </span>
    </label>
  )
}

function FieldGroup({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="pt-8 first:pt-0">
      <div className="flex items-baseline gap-2 mb-1">
        <h2 className="text-xs font-semibold text-fg-muted uppercase tracking-wider">{title}</h2>
        {hint && <span className="text-[0.65rem] text-fg-subtle">{hint}</span>}
      </div>
      <div className="flex flex-wrap items-end gap-x-6 gap-y-4">{children}</div>
    </section>
  )
}

export function LlamaCreateModelPage({ modelId }: { modelId: string | null }) {
  const models = useLlamaModelsStore((s) => s.models)
  const upsertModel = useLlamaModelsStore((s) => s.upsertModel)
  const startModel = useLlamaStore((s) => s.startModel)
  const stopModel = useLlamaStore((s) => s.stopModel)

  const existing = modelId ? models.find((m) => m.id === modelId) : undefined

  // The run is keyed by the form's id (defaultLlamaModelConfig assigns one
  // up front), so the launch state renders even before the first Save —
  // subscribing on the tab's modelId would be null for `llama-model://new`.
  const [form, setForm] = useState<LlamaModelConfig>(() => existing ?? defaultLlamaModelConfig())
  const run = useLlamaStore((s) => s.runs[form.id])
  const consoleRef = useRef<HTMLDivElement>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const skipAutoSave = useRef(true)

  // Reset the form when the user navigates between models (the page stays
  // mounted while switching tabs that share it).
  useEffect(() => {
    skipAutoSave.current = true
    setForm(existing ?? defaultLlamaModelConfig())
  }, [modelId, existing?.id])

  // Auto-save 400ms after any change, skipping the initial render and
  // model-navigation resets.
  useEffect(() => {
    if (skipAutoSave.current) {
      skipAutoSave.current = false
      return
    }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => upsertModel(form), 400)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [form])

  // Keep the console pinned to the tail while the server streams output.
  useEffect(() => {
    const el = consoleRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [run?.output])

  function patch(p: Partial<LlamaModelConfig>) {
    setForm((f) => ({ ...f, ...p }))
  }

  async function handleLaunch() {
    await startModel(form.id, {
      modelPath: form.modelPath,
      serverExecutable: form.serverExecutable,
      host: form.host,
      port: form.port,
      apiKey: form.apiKey,
      contextSize: form.contextSize,
      batchSize: form.batchSize,
      gpuLayers: form.gpuLayers,
      parallelRequests: form.parallelRequests,
      reasoningEffort: form.reasoningEffort,
      alias: form.alias,
    })
  }

  const running = run?.running ?? false
  const output = run?.output ?? ''
  const error = run?.error ?? null
  const canLaunch = form.modelPath.trim().length > 0

  return (
    <div className="h-full flex flex-col bg-panel overflow-hidden">
      <div className="h-11 px-4 border-b border-border shrink-0 flex items-center">
        <h1 className="text-sm font-semibold text-fg truncate">
          {existing ? `Edit Model — ${existing.displayName || existing.alias || existing.id}` : 'Create Model'}
        </h1>
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-6">
        <FieldGroup title="Model Identity">
          <div className="flex flex-col gap-1.5 w-64">
            <label htmlFor="llama-displayName" className="text-sm text-fg">Display Name</label>
            <input
              id="llama-displayName"
              type="text"
              value={form.displayName}
              onChange={(e) => patch({ displayName: e.target.value })}
              placeholder="Qwen3.8 27B"
              spellCheck={false}
              className="h-8 px-2 text-sm text-fg bg-bg border border-border rounded-lg focus:outline-none focus:border-accent/60"
            />
          </div>
          <div className="flex flex-col gap-1.5 w-40">
            <label htmlFor="llama-alias" className="text-sm text-fg">Alias</label>
            <input
              id="llama-alias"
              type="text"
              value={form.alias}
              onChange={(e) => patch({ alias: e.target.value })}
              placeholder="Qwen3.8 27B"
              spellCheck={false}
              className="h-8 px-2 text-sm font-mono text-fg bg-bg border border-border rounded-lg focus:outline-none focus:border-accent/60"
            />
          </div>
          <ToggleField
            label="Enabled"
            description="Show in the model dropdown"
            checked={form.enabled}
            onChange={(v) => patch({ enabled: v })}
          />
          <ToggleField
            label="Auto Start"
            description="Start when this model is selected or required"
            checked={form.autoStart}
            onChange={(v) => patch({ autoStart: v })}
          />
        </FieldGroup>

        <FieldGroup title="Model Runtime">
          <PathField
            id="llama-modelPath"
            label="Model File (GGUF)"
            value={form.modelPath}
            onChange={(v) => patch({ modelPath: v })}
            placeholder="~/models/Qwen3.8-27B-UD-IQ4_XS.gguf"
            onBlur={() => {
              if (!form.modelPath) return
              const name = deriveModelName(form.modelPath)
              patch({
                ...(form.displayName === '' ? { displayName: name } : {}),
                ...(form.alias === '' ? { alias: name } : {}),
              })
            }}
            onBrowse={async () => {
              const home = await window.api.getHomeDir()
              const picked = await window.api.openFile({
                defaultPath: `${home}/models`,
                filters: [{ name: 'GGUF Models', extensions: ['gguf'] }],
              })
              if (!picked) return
              const name = deriveModelName(picked)
              patch({
                modelPath: picked,
                ...(form.displayName === '' ? { displayName: name } : {}),
                ...(form.alias === '' ? { alias: name } : {}),
              })
            }}
          />
          <PathField
            id="llama-serverExecutable"
            label="Server Executable"
            value={form.serverExecutable}
            onChange={(v) => patch({ serverExecutable: v })}
            placeholder="auto-detect"
          />
          <div className="flex flex-col gap-1.5 w-32">
            <label htmlFor="llama-host" className="text-sm text-fg">Host</label>
            <input
              id="llama-host"
              type="text"
              value={form.host}
              onChange={(e) => patch({ host: e.target.value })}
              spellCheck={false}
              className="h-8 px-2 text-sm font-mono text-fg bg-bg border border-border rounded-lg focus:outline-none focus:border-accent/60"
            />
          </div>
          <NumberField id="llama-port" label="Port" value={form.port} onChange={(v) => patch({ port: v })} />
          <div className="flex flex-col gap-1.5 w-32">
            <label htmlFor="llama-apiKey" className="text-sm text-fg">API Key</label>
            <input
              id="llama-apiKey"
              type="text"
              value={form.apiKey}
              onChange={(e) => patch({ apiKey: e.target.value })}
              spellCheck={false}
              className="h-8 px-2 text-sm font-mono text-fg bg-bg border border-border rounded-lg focus:outline-none focus:border-accent/60"
            />
          </div>
          <SelectField<number>
            id="llama-contextSize"
            label="Context Size (-c)"
            value={form.contextSize}
            options={CONTEXT_SIZE_OPTIONS}
            onChange={(v) => patch({ contextSize: v })}
            parse={Number}
          />
          <NumberField id="llama-batchSize" label="Batch Size" value={form.batchSize} onChange={(v) => patch({ batchSize: v })} />
          <NumberField id="llama-gpuLayers" label="GPU Layers (-ngl)" value={form.gpuLayers} onChange={(v) => patch({ gpuLayers: v })} />
          <NumberField id="llama-parallelRequests" label="Parallel (-np)" value={form.parallelRequests} onChange={(v) => patch({ parallelRequests: v })} />
          <SelectField
            id="llama-reasoningEffort"
            label="Reasoning Effort"
            value={form.reasoningEffort}
            options={REASONING_EFFORTS}
            onChange={(v) => patch({ reasoningEffort: v as ReasoningEffort })}
          />
        </FieldGroup>

        {(output || error) && (
          <section className="pt-8">
            <h2 className="text-xs font-semibold text-fg-muted uppercase tracking-wider mb-3">
              Server Output
            </h2>
            <div
              ref={consoleRef}
              className="h-48 overflow-auto rounded-lg border border-border bg-bg p-3 font-mono text-xs whitespace-pre-wrap break-all text-fg-muted"
            >
              {output || (error ?? '')}
            </div>
          </section>
        )}
      </div>

      <div className="shrink-0 px-4 py-3 border-t border-border flex items-center justify-end gap-2">
        {running && (
          <button
            type="button"
            onClick={() => stopModel(form.id)}
            className="h-8 px-3 rounded border border-red-500/60 text-sm text-red-400 hover:border-red-400 transition-colors"
          >
            Stop Server
          </button>
        )}
        <button
          type="button"
          onClick={handleLaunch}
          disabled={!canLaunch || running}
          title={canLaunch ? `Launch llama-server on ${form.host}:${form.port}` : 'Set a model path first'}
          className="h-8 px-4 rounded bg-accent text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40 disabled:pointer-events-none"
        >
          {running ? 'Running…' : 'Launch'}
        </button>
      </div>

      {error && (
        <div className="shrink-0 px-4 py-2 border-t border-red-500/40 bg-red-500/10 text-xs text-red-400 truncate">
          {error}
        </div>
      )}
    </div>
  )
}
