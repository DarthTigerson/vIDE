import { useEffect } from 'react'
import { useLlamaStore } from '@/stores/llamaStore'
import { useEditorStore } from '@/stores/editorStore'
import { buildTerminalPath } from '@/components/Settings/paths'

// Matches GitPanel's pill button styling so Llama's controls read as part of
// the same left-sidebar panel family (same pattern as GraphifyPanel).
const pillButtonClass =
  'w-full h-7 rounded-full flex items-center justify-center text-[0.625rem] font-bold tracking-tight bg-accent/80 text-on-accent transition-colors hover:bg-accent active:scale-95 disabled:opacity-40 disabled:pointer-events-none'

const INSTALL_COMMAND = 'brew install llama.cpp'

export function LlamaPanel() {
  const { available, checking, checkAvailable } = useLlamaStore()
  const openTab = useEditorStore((s) => s.openTab)

  useEffect(() => {
    if (available === null && !checking) checkAvailable()
  }, [available, checking, checkAvailable])

  // One click gets a terminal open with the install command already on the
  // clipboard, ready to paste — same pattern as GraphifyPanel's quick launch.
  function launchInstall() {
    navigator.clipboard?.writeText(INSTALL_COMMAND).catch(() => {})
    openTab({ path: buildTerminalPath(`llama-install-${Date.now().toString(36)}`), content: '', dirty: false })
  }

  // The model editor page lands in the next task — for now the button is
  // present (so the "available" state is clear) but disabled.
  function openCreateModel() {
    // TODO(llama): open the create/edit model page.
  }

  if (available === false) {
    return (
      <div className="h-full flex flex-col bg-sidebar border-r border-border overflow-hidden">
        <div className="h-9 px-3 flex items-center justify-between border-b border-border shrink-0">
          <span className="text-xs font-semibold text-fg-muted uppercase tracking-wider">
            Llama
          </span>
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
    // Still probing — briefly shows the checking state before the IPC round
    // trip settles, so the panel never flashes "not installed" by accident.
    return (
      <div className="h-full flex flex-col bg-sidebar border-r border-border overflow-hidden">
        <div className="h-9 px-3 flex items-center justify-between border-b border-border shrink-0">
          <span className="text-xs font-semibold text-fg-muted uppercase tracking-wider">
            Llama
          </span>
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
      <div className="h-9 px-3 flex items-center justify-between border-b border-border shrink-0">
        <span className="text-xs font-semibold text-fg-muted uppercase tracking-wider">
          Llama
        </span>
      </div>

      <div className="flex-1 min-h-0" />

      <div className="shrink-0 p-3 border-t border-border">
        <button
          type="button"
          className={pillButtonClass}
          disabled
          onClick={openCreateModel}
        >
          Create Model
        </button>
      </div>
    </div>
  )
}
