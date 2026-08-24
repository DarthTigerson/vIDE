import { create } from 'zustand'
import { isMac } from '@/lib/platform'
import { useFileStore } from '@/stores/fileStore'

export type OnboardingStepId = 'welcome' | 'theme' | 'assistants' | 'features' | 'git' | 'permissions' | 'done'

// Automation/AppleEvents priming is a macOS-only concept (Linux has no TCC),
// so that step is simply absent from the flow there rather than shown and
// immediately skipped.
export const ONBOARDING_STEPS: OnboardingStepId[] = [
  'welcome',
  'theme',
  'assistants',
  'features',
  'git',
  ...(isMac ? (['permissions'] as const) : []),
  'done',
]

interface OnboardingState {
  open: boolean
  stepIndex: number
  checkStatus: () => Promise<void>
  next: () => void
  back: () => void
  skip: () => void
  complete: () => void
  replay: () => Promise<void>
}

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  open: false,
  stepIndex: 0,

  checkStatus: async () => {
    const status = await window.api.onboardingGetStatus()
    if (!status.completed) set({ open: true, stepIndex: 0 })
  },

  next: () => {
    const { stepIndex } = get()
    if (stepIndex >= ONBOARDING_STEPS.length - 1) {
      get().complete()
      return
    }
    set({ stepIndex: stepIndex + 1 })
  },

  back: () => set((s) => ({ stepIndex: Math.max(0, s.stepIndex - 1) })),

  skip: () => get().complete(),

  complete: () => {
    set({ open: false })
    window.api.onboardingMarkComplete()
  },

  replay: async () => {
    await window.api.onboardingReset()
    // Soft reset: drop back to the project picker so the wizard runs
    // against a clean slate, same as a genuine first launch.
    useFileStore.getState().closeProject()
    set({ open: true, stepIndex: 0 })
  },
}))
