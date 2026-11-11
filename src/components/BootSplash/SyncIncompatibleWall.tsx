import { useEffect, useState } from 'react'
import { useUpdateStore } from '@/stores/updateStore'

// Shown in place of the whole app when vIDE Sync pulled config written by a
// newer, incompatible vIDE (VIDE-162). No activity bar, no panels, nothing to
// dismiss — the only way forward is to update. preBootSync has already forced
// the vIDE theme with no background image and paused sync push, so this older
// build can't overwrite the newer machine's settings while it sits here.
export function SyncIncompatibleWall() {
  const status = useUpdateStore((s) => s.status)
  const stage = useUpdateStore((s) => s.stage)
  const available = useUpdateStore((s) => s.available)
  const checking = useUpdateStore((s) => s.checking)
  const log = useUpdateStore((s) => s.log)
  const checkForUpdates = useUpdateStore((s) => s.checkForUpdates)
  const startUpdate = useUpdateStore((s) => s.startUpdate)
  const restart = useUpdateStore((s) => s.restart)
  const [showDetails, setShowDetails] = useState(false)

  // Injected by electron.vite.config.ts; absent under vitest.
  const current = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : null

  // Populate `available` so the button can name the target version.
  useEffect(() => { checkForUpdates() }, [checkForUpdates])

  const stageLabel =
    stage === 'password' ? 'Waiting for your password…'
      : stage === 'install' ? 'Installing…'
        : 'Downloading…'

  return (
    <div className="flex h-screen w-screen items-center justify-center overflow-auto bg-panel px-8 text-fg">
      <div className="flex w-full max-w-[34rem] flex-col items-center gap-6 py-12 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-accent text-accent [&_svg]:h-7 [&_svg]:w-7">
          <ArrowUpIcon />
        </div>

        <div>
          <h1 className="text-2xl font-semibold">Update required</h1>
          <p className="mt-3 text-base text-fg-muted">
            vIDE Sync received settings from a newer version of vIDE
            {current ? ` than the one installed here (v${current})` : ''}.
          </p>
          <p className="mt-2 text-base text-fg-muted">
            This copy can't read them safely, so it's paused to avoid overwriting
            your other machine's settings. Update vIDE to continue — your synced
            settings will be applied once you're up to date.
          </p>
        </div>

        <div className="flex min-h-11 items-center justify-center">
          {status === 'updating' ? (
            <span className="text-base text-fg-muted">{stageLabel}</span>
          ) : status === 'ready' ? (
            <PillButton solid onClick={restart}>Restart to finish</PillButton>
          ) : status === 'failed' ? (
            <div className="flex flex-col items-center gap-3">
              <span className="text-base text-red-400">The update didn't finish.</span>
              <PillButton solid onClick={startUpdate}>Try again</PillButton>
            </div>
          ) : (
            <PillButton solid onClick={startUpdate}>
              {available ? `Update to v${available.version}` : checking ? 'Checking…' : 'Update vIDE'}
            </PillButton>
          )}
        </div>

        {log.length > 0 && (
          <div className="w-full text-left">
            <button type="button" onClick={() => setShowDetails((v) => !v)} className="text-sm text-fg-muted hover:text-fg">
              {showDetails ? '▾ Hide details' : '▸ Show details'}
            </button>
            {showDetails && (
              <pre className="mt-2 max-h-44 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-bg px-4 py-3 font-mono text-xs leading-relaxed text-fg-muted">
                {log.map((l, i) => (
                  <div key={i} className={l.stream === 'stderr' ? 'text-red-400' : undefined}>{l.line}</div>
                ))}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function PillButton({ solid, onClick, children }: { solid?: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'h-10 rounded-full px-6 text-base transition-colors',
        solid ? 'border border-accent bg-accent font-semibold text-on-accent' : 'border border-border bg-bg text-fg hover:border-fg-subtle',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

const ArrowUpIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 20V5m0 0-6 6m6-6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
