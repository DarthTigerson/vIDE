import { useOnboardingStore, ONBOARDING_STEPS } from '@/stores/onboardingStore'
import { WelcomeStep } from './WelcomeStep'
import { ThemeStep } from './ThemeStep'
import { AssistantsStep } from './AssistantsStep'
import { FeaturesStep } from './FeaturesStep'
import { GitIdentityStep } from './GitIdentityStep'
import { PermissionsStep } from './PermissionsStep'
import { DoneStep } from './DoneStep'

const STEP_COMPONENTS = {
  welcome: WelcomeStep,
  theme: ThemeStep,
  assistants: AssistantsStep,
  features: FeaturesStep,
  git: GitIdentityStep,
  permissions: PermissionsStep,
  done: DoneStep,
}

// Mounted at the App.tsx top level (alongside UpdateChangelogModal), not
// nested inside the Sidebar tree — this codebase has been bitten before by
// overlays nested under the sidebar clipping/stacking incorrectly.
export function SetupWizard() {
  const open = useOnboardingStore((s) => s.open)
  const stepIndex = useOnboardingStore((s) => s.stepIndex)

  if (!open) return null

  const stepId = ONBOARDING_STEPS[stepIndex]
  const StepComponent = STEP_COMPONENTS[stepId]
  const isFirst = stepIndex === 0
  const isLast = stepIndex === ONBOARDING_STEPS.length - 1

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60">
      <div className="w-[560px] max-h-[80vh] flex flex-col bg-popover border border-border rounded-xl shadow-2xl shadow-black/60 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-1.5">
            {ONBOARDING_STEPS.map((id, i) => (
              <span
                key={id}
                className={[
                  'w-1.5 h-1.5 rounded-full transition-colors',
                  i === stepIndex ? 'bg-accent' : i < stepIndex ? 'bg-accent/40' : 'bg-fg-subtle/40',
                ].join(' ')}
              />
            ))}
          </div>
          {!isLast && (
            <button
              type="button"
              onClick={() => useOnboardingStore.getState().skip()}
              className="text-xs text-fg-muted hover:text-fg transition-colors"
            >
              Skip setup
            </button>
          )}
        </div>

        <div className="overflow-y-auto flex-1 p-6">
          <StepComponent />
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-border shrink-0">
          <button
            type="button"
            onClick={() => useOnboardingStore.getState().back()}
            disabled={isFirst}
            className="h-8 px-3 rounded border border-border text-sm text-fg hover:border-fg-subtle transition-colors disabled:opacity-0 disabled:pointer-events-none"
          >
            Back
          </button>
          <button
            type="button"
            onClick={() => useOnboardingStore.getState().next()}
            className="h-8 px-4 rounded bg-accent text-white text-sm font-medium hover:opacity-90 transition-opacity"
          >
            {isLast ? 'Done' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  )
}
