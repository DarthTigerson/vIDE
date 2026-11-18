import { useState } from 'react'

type PrimeState = 'idle' | 'priming' | 'granted' | 'denied'

export function PermissionsStep() {
  const [state, setState] = useState<PrimeState>('idle')

  const grant = async () => {
    setState('priming')
    const ok = await window.api.onboardingPrimeAutomationPermission()
    setState(ok ? 'granted' : 'denied')
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-semibold text-fg">macOS permission</h2>
        <p className="text-xs text-fg-muted mt-0.5">
          Deleting a file (or discarding an untracked file in the Git panel) asks Finder to move it
          to Trash, which macOS gates behind an Automation permission prompt. Click below to trigger
          that prompt now, in context, instead of it showing up unexpectedly later.
        </p>
      </div>

      <div className="rounded-lg border border-border/60 p-4 flex flex-col gap-3">
        <button
          type="button"
          onClick={grant}
          disabled={state === 'priming'}
          className="self-start h-8 px-3 rounded-sm bg-accent text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {state === 'priming' ? 'Waiting for system dialog…' : 'Grant Access'}
        </button>

        {state === 'granted' && <p className="text-xs text-green-500">✓ Granted</p>}
        {state === 'denied' && (
          <p className="text-xs text-fg-muted">
            Not granted yet. If you clicked "Don't Allow," you can enable it manually below.
          </p>
        )}

        <button
          type="button"
          onClick={() => window.api.onboardingOpenAutomationSettings()}
          className="self-start text-xs text-accent hover:underline"
        >
          Open System Settings → Privacy &amp; Security → Automation
        </button>
      </div>
    </div>
  )
}
