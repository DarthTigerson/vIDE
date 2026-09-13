import { useEffect, useRef, useState } from 'react'
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
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(toOption(e.target.value))}
        className="h-8 px-2 text-sm text-fg bg-bg border border-border rounded-lg focus:outline-none focus:border-accent/60"
      >
        {options.map((opt) => (
          <option key={String(opt)} value={String(opt)}>{opt}</option>
        ))}
      </select>
    </div>
  )
}

function PathField({ id, label, value, onChange, placeholder }: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div className="flex flex-col gap-1.5 w-full">
      <label htmlFor={id} className="text-sm text-fg">{label}</label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        className="h-8 px-2 text-sm font-mono text-fg bg-bg border border-border rounded-lg focus:outline-none focus:border-accent/60"
      />
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
    <label className="flex items-center gap-3 cursor-pointer">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={(e) => {
          e.preventDefault()
          onChange(!checked)
        }}
        className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${checked ? 'bg-accent' : 'bg-white/15'}`}
      >
        <span
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-[1.125rem]' : 'translate-x-0.5'}`}
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
  const [saved, setSaved] = useState(false)
  const consoleRef = useRef<HTMLDivElement>(null)

  // Reset the form when the user navigates between models (the page stays
  // mounted while switching tabs that share it).
  useEffect(() => {
    setForm(existing ?? defaultLlamaModelConfig())
    setSaved(false)
  }, [modelId, existing?.id])

  // Keep the console pinned to the tail while the server streams output.
  useEffect(() => {
    const el = consoleRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [run?.output])

  function patch(p: Partial<LlamaModelConfig>) {
    setForm((f) => ({ ...f, ...p }))
    setSaved(false)
  }

  function handleSave() {
    upsertModel({ ...form, id: form.id || crypto.randomUUID() })
    setSaved(true)
  }

  async function handleLaunch() {
    const cfg = { ...form, id: form.id || crypto.randomUUID() }
    upsertModel(cfg)
    setSaved(true)
    const launchCfg = {
      modelPath: cfg.modelPath,
      serverExecutable: cfg.serverExecutable,
      host: cfg.host,
      port: cfg.port,
      apiKey: cfg.apiKey,
      contextSize: cfg.contextSize,
      batchSize: cfg.batchSize,
      gpuLayers: cfg.gpuLayers,
      parallelRequests: cfg.parallelRequests,
      reasoningEffort: cfg.reasoningEffort,
      alias: cfg.alias,
    }
    await startModel(cfg.id, launchCfg)
  }

  const running = run?.running ?? false
  const output = run?.output ?? ''
  const error = run?.error ?? null
  const canLaunch = form.modelPath.trim().length > 0

  return (
    <div className="h-full flex flex-col bg-panel overflow-hidden">
      <div className="h-11 px-4 border-b border-border shrink-0 flex items-center justify-between gap-3">
        <h1 className="text-sm font-semibold text-fg truncate">
          {existing ? `Edit Model — ${existing.displayName || existing.alias || existing.id}` : 'Create Model'}
        </h1>
        <div className="flex items-center gap-2 shrink-0">
          {running && (
            <button
              type="button"
              onClick={() => stopModel(form.id)}
              className="h-7 px-3 rounded-full text-xs font-semibold bg-red-600/80 hover:bg-red-600 text-white transition-colors"
            >
              Stop Server
            </button>
          )}
          <button
            type="button"
            onClick={handleSave}
            className="h-7 px-3 rounded-full text-xs font-semibold border border-border text-fg hover:border-fg-subtle transition-colors"
          >
            Save
          </button>
          <button
            type="button"
            onClick={handleLaunch}
            disabled={!canLaunch || running}
            title={canLaunch ? `Launch llama-server on ${form.host}:${form.port}` : 'Set a model path first'}
            className="h-7 px-3 rounded-full text-xs font-semibold bg-accent/80 hover:bg-accent text-on-accent transition-colors disabled:opacity-40 disabled:pointer-events-none"
          >
            {running ? 'Running…' : 'Launch'}
          </button>
        </div>
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
              placeholder="Cosmos — Qwen3.8 27B"
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
              placeholder="cosmos"
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
        </FieldGroup>

        <FieldGroup title="Model Runtime">
          <PathField
            id="llama-modelPath"
            label="Model File (GGUF)"
            value={form.modelPath}
            onChange={(v) => patch({ modelPath: v })}
            placeholder="~/models/Qwen3.8-27B-UD-IQ4_XS.gguf"
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
          <ToggleField
            label="Auto Start"
            description="Start when this model is selected or required"
            checked={form.autoStart}
            onChange={(v) => patch({ autoStart: v })}
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

      {error && (
        <div className="shrink-0 px-4 py-2 border-t border-red-500/40 bg-red-500/10 text-xs text-red-400 truncate">
          {error}
        </div>
      )}
    </div>
  )
}
