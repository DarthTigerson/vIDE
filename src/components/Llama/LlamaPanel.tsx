import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLlamaStore } from '@/stores/llamaStore'
import { useLlamaModelsStore, type LlamaModelConfig } from '@/stores/llamaModelsStore'
import { useEditorStore } from '@/stores/editorStore'
import { clampToViewport } from '@/components/ui/clampToViewport'
import { buildLlamaModelPath, buildTerminalPath } from '@/components/Settings/paths'

const pillButtonClass =
  'w-full h-7 rounded-full flex items-center justify-center text-[0.625rem] font-bold tracking-tight bg-accent/80 text-on-accent transition-colors hover:bg-accent active:scale-95 disabled:opacity-40 disabled:pointer-events-none'

const INSTALL_COMMAND = 'brew install llama.cpp'

function EditIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
      <path d="M4 20h4l10.5-10.5a2.83 2.83 0 0 0-4-4L4 16v4Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function TerminalIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
      <path d="M4 17l6-6-6-6M11 19h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 4l14 8-14 8V4Z" />
    </svg>
  )
}

function StopIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
      <rect x="5" y="5" width="14" height="14" rx="1.5" />
    </svg>
  )
}

function RestartIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
      <path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M18 3v4h-4M6 21v-4h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  )
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M18 3v4h-4M6 21v-4h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

type MenuAction =
  | { key: string; label: string; icon: React.ReactNode; onSelect: () => void; disabled?: boolean; danger?: boolean }
  | { key: string; separator: true }

function ContextMenuList({ x, y, actions, onClose }: {
  x: number
  y: number
  actions: MenuAction[]
  onClose: () => void
}) {
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) onClose()
    }
    const closeOnEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [onClose])

  useLayoutEffect(() => {
    if (!menuRef.current) return
    const rect = menuRef.current.getBoundingClientRect()
    const clamped = clampToViewport(x, y, rect.width, rect.height)
    menuRef.current.style.left = `${clamped.x}px`
    menuRef.current.style.top = `${clamped.y}px`
  }, [x, y])

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[200] min-w-[130px] rounded border border-border bg-popover p-1 shadow-2xl shadow-black/50 flex flex-col gap-0.5"
      style={{ left: x, top: y }}
    >
      {actions.map((action) =>
        'separator' in action
          ? <div key={action.key} className="my-0.5 border-t border-border" />
          : (
            <button
              key={action.key}
              type="button"
              disabled={action.disabled}
              onClick={() => { onClose(); action.onSelect() }}
              className={[
                'flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
                action.danger ? 'text-red-400 hover:bg-red-500/10' : 'text-fg hover:bg-white/5',
              ].join(' ')}
            >
              <span className="w-3.5 h-3.5 flex items-center justify-center shrink-0">{action.icon}</span>
              {action.label}
            </button>
          )
      )}
    </div>,
    document.body
  )
}

function ModelRow({ model }: { model: LlamaModelConfig }) {
  const run = useLlamaStore((s) => s.runs[model.id])
  const startModel = useLlamaStore((s) => s.startModel)
  const stopModel = useLlamaStore((s) => s.stopModel)
  const removeModel = useLlamaModelsStore((s) => s.removeModel)
  const openTab = useEditorStore((s) => s.openTab)
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null)
  const [launching, setLaunching] = useState(false)

  const running = run?.running ?? false
  const busy = launching

  function openEdit() {
    openTab({ path: buildLlamaModelPath(model.id), content: '', dirty: false })
  }

  function openTerminal() {
    openTab({ path: buildTerminalPath(`llama-${model.id}`), content: '', dirty: false })
  }

  const launchCfg = {
    modelPath: model.modelPath,
    serverExecutable: model.serverExecutable,
    host: model.host,
    port: model.port,
    apiKey: model.apiKey,
    contextSize: model.contextSize,
    batchSize: model.batchSize,
    gpuLayers: model.gpuLayers,
    parallelRequests: model.parallelRequests,
    reasoningEffort: model.reasoningEffort,
    alias: model.alias,
  }

  async function handleLaunch() {
    setLaunching(true)
    try {
      await startModel(model.id, launchCfg)
    } finally {
      setLaunching(false)
    }
  }

  async function handleRestart() {
    setLaunching(true)
    try {
      await stopModel(model.id)
      await startModel(model.id, launchCfg)
    } finally {
      setLaunching(false)
    }
  }

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault()
    setContextMenuPos({ x: e.clientX, y: e.clientY })
  }

  const actions: MenuAction[] = [
    { key: 'launch', label: 'Launch', icon: <PlayIcon />, disabled: busy || running || !model.modelPath, onSelect: handleLaunch },
    { key: 'stop', label: 'Stop', icon: <StopIcon />, disabled: busy || !running, onSelect: () => stopModel(model.id) },
    { key: 'restart', label: 'Restart', icon: <RestartIcon />, disabled: busy || !running || !model.modelPath, onSelect: handleRestart },
    { key: 'remove', label: 'Delete', icon: <CloseIcon />, danger: true, disabled: busy, onSelect: () => removeModel(model.id) },
    { key: 'sep', separator: true },
    { key: 'edit', label: 'Edit', icon: <EditIcon />, onSelect: openEdit },
    { key: 'terminal', label: 'View Terminal', icon: <TerminalIcon />, onSelect: openTerminal },
  ]

  return (
    <li
      onContextMenu={handleContextMenu}
      className="flex flex-col gap-1 px-3 py-2 rounded-lg border border-border"
    >
      <div className="flex items-center gap-2">
        <button type="button" onClick={openEdit} className="flex items-center gap-2 min-w-0 flex-1 text-left">
          {busy ? (
            <RefreshIcon className="w-2 h-2 shrink-0 animate-spin text-fg-muted" />
          ) : (
            <span className={`w-2 h-2 rounded-full shrink-0 ${running ? 'bg-green-400' : 'bg-fg-subtle'}`} />
          )}
          <span className="text-xs font-medium text-fg truncate">
            {model.displayName || model.alias || model.id}
          </span>
        </button>
      </div>
      <span className="text-[0.625rem] text-fg-muted pl-4 truncate">
        {running ? `Running — ${model.host}:${model.port}` : model.alias || `${model.host}:${model.port}`}
      </span>

      {contextMenuPos && (
        <ContextMenuList
          x={contextMenuPos.x}
          y={contextMenuPos.y}
          actions={actions}
          onClose={() => setContextMenuPos(null)}
        />
      )}
    </li>
  )
}

export function LlamaPanel() {
  const { available, checking, checkAvailable } = useLlamaStore()
  const models = useLlamaModelsStore((s) => s.models)
  const openTab = useEditorStore((s) => s.openTab)

  useEffect(() => {
    if (available === null && !checking) checkAvailable()
  }, [available, checking, checkAvailable])

  function launchInstall() {
    navigator.clipboard?.writeText(INSTALL_COMMAND).catch(() => {})
    openTab({ path: buildTerminalPath(`llama-install-${Date.now().toString(36)}`), content: '', dirty: false })
  }

  function openCreateModel() {
    openTab({ path: buildLlamaModelPath('new'), content: '', dirty: false })
  }

  if (available === false) {
    return (
      <div className="h-full flex flex-col bg-sidebar border-r border-border overflow-hidden">
        <div className="h-9 px-3 flex items-center border-b border-border shrink-0">
          <span className="text-xs font-semibold text-fg-muted uppercase tracking-wider">Llama</span>
        </div>
        <div className="flex-1 flex items-center justify-center p-6 text-center">
          <div>
            <p className="text-sm text-fg mb-2">llama.cpp isn't installed.</p>
            <p className="text-xs text-fg-subtle font-mono mb-3">{INSTALL_COMMAND}</p>
            <button type="button" className={pillButtonClass} onClick={launchInstall}>
              Open Terminal &amp; Copy Install Command
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (available === null) {
    return (
      <div className="h-full flex flex-col bg-sidebar border-r border-border overflow-hidden">
        <div className="h-9 px-3 flex items-center border-b border-border shrink-0">
          <span className="text-xs font-semibold text-fg-muted uppercase tracking-wider">Llama</span>
        </div>
        <div className="flex-1 min-h-0" />
        <div className="shrink-0 p-3 border-t border-border">
          <button type="button" className={pillButtonClass} disabled>
            Checking for llama.cpp…
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-sidebar border-r border-border overflow-hidden">
      <div className="h-9 px-3 flex items-center border-b border-border shrink-0">
        <span className="text-xs font-semibold text-fg-muted uppercase tracking-wider">Llama</span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {models.length === 0 ? (
          <div className="flex items-center justify-center h-full p-6 text-center">
            <p className="text-xs text-fg-subtle">No models yet. Create one to get started.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2 p-2">
            {models.map((model) => (
              <ModelRow key={model.id} model={model} />
            ))}
          </ul>
        )}
      </div>

      <div className="shrink-0 p-3 border-t border-border">
        <button type="button" className={pillButtonClass} onClick={openCreateModel}>
          Create Model
        </button>
      </div>
    </div>
  )
}
