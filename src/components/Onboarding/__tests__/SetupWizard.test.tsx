/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

const { api } = vi.hoisted(() => {
  // jsdom's `window`/`navigator` already exist by the time this hoisted
  // block runs — attach `api` the same way preload.ts's contextBridge does,
  // rather than replacing `window` wholesale (which would drop jsdom's own
  // window APIs that other steps/stores rely on, e.g. window.matchMedia).
  const api = {
    onboardingMarkComplete: vi.fn().mockResolvedValue(undefined),
  }
  ;(globalThis as any).window.api = api
  return { api }
})

import { SetupWizard } from '../SetupWizard'
import { useOnboardingStore } from '@/stores/onboardingStore'

afterEach(() => cleanup())

describe('SetupWizard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useOnboardingStore.setState({ open: false, stepIndex: 0 })
  })

  it('renders nothing when the store says the wizard is closed', () => {
    render(<SetupWizard />)
    expect(screen.queryByText('Welcome to vIDE')).not.toBeInTheDocument()
  })

  it('shows the welcome step first when open', () => {
    useOnboardingStore.setState({ open: true, stepIndex: 0 })
    render(<SetupWizard />)
    expect(screen.getByText('Welcome to vIDE')).toBeInTheDocument()
  })

  it('"Skip setup" closes the wizard and marks onboarding complete', () => {
    useOnboardingStore.setState({ open: true, stepIndex: 0 })
    render(<SetupWizard />)
    fireEvent.click(screen.getByText('Skip setup'))
    expect(useOnboardingStore.getState().open).toBe(false)
    expect(api.onboardingMarkComplete).toHaveBeenCalled()
  })

  it('"Next" advances to the next step', () => {
    useOnboardingStore.setState({ open: true, stepIndex: 0 })
    render(<SetupWizard />)
    fireEvent.click(screen.getByText('Next'))
    expect(useOnboardingStore.getState().stepIndex).toBe(1)
  })
})
