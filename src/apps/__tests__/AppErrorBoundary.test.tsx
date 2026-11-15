// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AppErrorBoundary } from '../AppErrorBoundary'
import { useAppContribStore } from '../appContribStore'

function Boom(): never { throw new Error('kaput') }

describe('AppErrorBoundary', () => {
  it('shows the failure and records a runtime error', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<AppErrorBoundary appId="hello" title="Hello"><Boom /></AppErrorBoundary>)
    expect(screen.getByText('Hello stopped working.')).toBeTruthy()
    expect(screen.getByText('kaput')).toBeTruthy()
    expect(useAppContribStore.getState().runtimeErrors.hello).toBe('kaput')
  })

  it('renders children under the app scope class', () => {
    render(<AppErrorBoundary appId="hello" title="Hello"><span>hi</span></AppErrorBoundary>)
    expect(screen.getByText('hi').parentElement?.className).toBe('vapp-hello')
  })
})
