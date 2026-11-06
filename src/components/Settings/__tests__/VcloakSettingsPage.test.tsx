/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { VcloakSettingsPage } from '../VcloakSettingsPage'
import type { VcloakState } from '../../../../electron/vcloak/types'

const REMOTE = 'acme-corp/core/app'

function makeState(over: Partial<VcloakState['config']> = {}): VcloakState {
  return {
    config: { enabled: false, mode: 'all', roots: [{ path: 'acme-corp', host: 'gitlab' }], exceptions: [], rules: [], maskRoot: false, maskLocalFolders: true, maskUsername: false, hiddenFolders: [], hiddenDecoys: {}, hiddenDepth: 'one', failClosed: true, coverBridge: true, coverTerminals: true, coverCodex: true, ...over },
    gateway: { running: true, port: 4545, error: null },
    encryptionAvailable: true,
    stats: { requests: 3, masked: 2, blocked: 1 },
    aliasCount: 7,
    sources: { graphify: { found: true, repos: 4, builtAt: null }, ripgrep: { repos: 1 }, repos: 5, scannedAt: null, workspaces: ['/ws'] },
  }
}

let api: Record<string, ReturnType<typeof vi.fn>>

beforeEach(() => {
  api = {
    vcloakGetState: vi.fn().mockResolvedValue(makeState()),
    vcloakSetConfig: vi.fn().mockImplementation(async (p) => ({ ok: true, state: makeState(p) })),
    vcloakPreview: vi.fn().mockResolvedValue({ masked: 'zq/app', restored: 'acme-corp/core/app' }),
    vcloakGenerateDecoy: vi.fn().mockResolvedValue('zq/kx'),
    vcloakRescan: vi.fn().mockResolvedValue(makeState()),
    vcloakClearAliases: vi.fn().mockResolvedValue(makeState()),
    vcloakListRepos: vi.fn().mockResolvedValue([{ remote: REMOTE, local: '/ws/app', alias: 'zq/app', cloaked: true }]),
  }
  ;(window as any).api = api
})

afterEach(() => cleanup())

describe('VcloakSettingsPage', () => {
  it('loads state and renders', async () => {
    render(<VcloakSettingsPage />)
    expect(await screen.findByText('Gateway: Running on 127.0.0.1:4545')).toBeInTheDocument()
    expect(screen.getByText(REMOTE)).toBeInTheDocument()
    expect(screen.getByText('zq/app')).toBeInTheDocument()
  })

  it('master toggle sends enabled:true', async () => {
    render(<VcloakSettingsPage />)
    fireEvent.click(await screen.findByRole('switch', { name: 'Enable vCloak' }))
    await waitFor(() => expect(api.vcloakSetConfig).toHaveBeenCalledWith({ enabled: true }))
  })

  it('shows an error result', async () => {
    api.vcloakSetConfig.mockResolvedValue({ ok: false, error: 'Keychain locked' })
    render(<VcloakSettingsPage />)
    fireEvent.click(await screen.findByRole('switch', { name: 'Enable vCloak' }))
    expect(await screen.findByText('Keychain locked')).toBeInTheDocument()
  })

  it('switching a repo off in all mode moves to all-except', async () => {
    render(<VcloakSettingsPage />)
    fireEvent.click(await screen.findByRole('switch', { name: `Cloak ${REMOTE}` }))
    await waitFor(() => expect(api.vcloakSetConfig).toHaveBeenCalledWith({ mode: 'all-except', exceptions: [REMOTE] }))
  })

  it('preview shows the reversible badge', async () => {
    render(<VcloakSettingsPage />)
    fireEvent.change(await screen.findByLabelText('Test text'), { target: { value: REMOTE } })
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    expect(await screen.findByText('Reversible')).toBeInTheDocument()
    expect(screen.getByLabelText('Masked output')).toHaveTextContent('zq/app')
  })

  it('has a hidden folders list and adds and removes folders', async () => {
    api.vcloakGetState.mockResolvedValue(makeState({ hiddenFolders: ['/Users/you/Work'] }))
    render(<VcloakSettingsPage />)
    expect(await screen.findByText('/Users/you/Work')).toBeInTheDocument()
    expect(screen.getByText(/swapped for realistic made-up names/)).toBeInTheDocument()
    expect(screen.getByText(/The top GitLab group or GitHub organisation your repositories live under. Add one per organisation./)).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('/Users/you/Documents'), { target: { value: '/Users/you/Documents' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add hidden folder' }))
    await waitFor(() => expect(api.vcloakSetConfig).toHaveBeenCalledWith({ hiddenFolders: ['/Users/you/Work', '/Users/you/Documents'] }))
    fireEvent.click(await screen.findByRole('button', { name: 'Remove hidden folder /Users/you/Work' }))
    await waitFor(() => expect(api.vcloakSetConfig).toHaveBeenCalledWith({ hiddenFolders: ['/Users/you/Documents'] }))
  })

  it('adds a hidden folder with its own replacement name', async () => {
    api.vcloakGetState.mockResolvedValue(makeState())
    render(<VcloakSettingsPage />)
    fireEvent.change(await screen.findByPlaceholderText('/Users/you/Documents'), { target: { value: '/Users/you/Documents/proj' } })
    fireEvent.change(screen.getByLabelText('New hidden folder shown as'), { target: { value: '/Users/you/Documents/acme-corp' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add hidden folder' }))
    await waitFor(() => expect(api.vcloakSetConfig).toHaveBeenCalledWith({
      hiddenFolders: ['/Users/you/Documents/proj'],
      hiddenDecoys: { '/Users/you/Documents/proj': '/Users/you/Documents/acme-corp' },
    }))
  })

  it('shows the hidden folders block in every mode', async () => {
    api.vcloakGetState.mockResolvedValue(makeState({ mode: 'selective' }))
    render(<VcloakSettingsPage />)
    expect(await screen.findByPlaceholderText('/Users/you/Documents')).toBeInTheDocument()
  })

  it('shows an error under the hidden folders section and keeps the typed text', async () => {
    api.vcloakSetConfig.mockResolvedValue({ ok: false, error: 'Hidden folder is too broad' })
    render(<VcloakSettingsPage />)
    const input = await screen.findByPlaceholderText('/Users/you/Documents')
    fireEvent.change(input, { target: { value: '/Users/you' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add hidden folder' }))
    expect(await screen.findByTestId('error-hidden')).toHaveTextContent('Hidden folder is too broad')
    expect(input).toHaveValue('/Users/you')
  })

  it('shows rule and exception errors next to their sections', async () => {
    api.vcloakGetState.mockResolvedValue(makeState({ mode: 'selective' }))
    api.vcloakSetConfig.mockResolvedValue({ ok: false, error: 'No git repository found at /x' })
    const { unmount } = render(<VcloakSettingsPage />)
    fireEvent.change(await screen.findByLabelText('New real path'), { target: { value: '/x' } })
    fireEvent.change(screen.getByLabelText('New decoy'), { target: { value: 'zq/kx' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Add' })[0])
    expect(await screen.findByTestId('error-rules')).toHaveTextContent('No git repository found at /x')
    unmount()
    cleanup()
    api.vcloakGetState.mockResolvedValue(makeState({ mode: 'all-except' }))
    render(<VcloakSettingsPage />)
    fireEvent.change(await screen.findByLabelText('New exception'), { target: { value: '/y' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Add' }).find((b) => b.getAttribute('aria-label') === null) as HTMLElement)
    expect(await screen.findByTestId('error-exceptions')).toBeInTheDocument()
  })

  it('shows a company root error under the roots and clears it after a good save', async () => {
    api.vcloakSetConfig.mockResolvedValueOnce({ ok: false, error: 'Company root must look like "acme-corp"' })
    render(<VcloakSettingsPage />)
    const root = await screen.findByRole('textbox', { name: 'New company root' })
    fireEvent.change(root, { target: { value: 'bad root!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add company root' }))
    expect(await screen.findByTestId('error-root')).toBeInTheDocument()
    fireEvent.change(root, { target: { value: 'acme-corp2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add company root' }))
    await waitFor(() => expect(screen.queryByTestId('error-root')).toBeNull())
  })

  it('lists roots with their host and adds, changes and removes them', async () => {
    api.vcloakGetState.mockResolvedValue(makeState({ roots: [{ path: 'acme-corp', host: 'gitlab' }, { path: 'acme-org', host: 'github' }] }))
    render(<VcloakSettingsPage />)
    expect(await screen.findByText('acme-org')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Host for acme-org' })).toHaveValue('github')
    expect(screen.getByRole('combobox', { name: 'Host for acme-corp' })).toHaveValue('gitlab')

    fireEvent.change(screen.getByRole('combobox', { name: 'Host for acme-corp' }), { target: { value: 'other' } })
    await waitFor(() => expect(api.vcloakSetConfig).toHaveBeenCalledWith({ roots: [{ path: 'acme-corp', host: 'other' }, { path: 'acme-org', host: 'github' }] }))

    fireEvent.click(screen.getByRole('button', { name: 'Remove root acme-org' }))
    await waitFor(() => expect(api.vcloakSetConfig).toHaveBeenCalledWith({ roots: [{ path: 'acme-corp', host: 'other' }] }))

    fireEvent.change(screen.getByRole('textbox', { name: 'New company root' }), { target: { value: 'acme-two' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'New company root host' }), { target: { value: 'other' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add company root' }))
    await waitFor(() => expect(api.vcloakSetConfig).toHaveBeenCalledWith({ roots: [{ path: 'acme-corp', host: 'other' }, { path: 'acme-two', host: 'other' }] }))
  })

  it('preselects the host from a pasted link', async () => {
    render(<VcloakSettingsPage />)
    const input = await screen.findByRole('textbox', { name: 'New company root' })
    const host = screen.getByRole('combobox', { name: 'New company root host' })
    expect(host).toHaveValue('gitlab')
    fireEvent.change(input, { target: { value: 'https://github.com/acme-org' } })
    expect(host).toHaveValue('github')
    fireEvent.click(screen.getByRole('button', { name: 'Add company root' }))
    await waitFor(() => expect(api.vcloakSetConfig).toHaveBeenCalledWith({ roots: [{ path: 'acme-corp', host: 'gitlab' }, { path: 'https://github.com/acme-org', host: 'github' }] }))
    fireEvent.change(input, { target: { value: 'https://gitlab.com/acme-corp/sub' } })
    expect(host).toHaveValue('gitlab')
  })

  it('toggles each AI tools covered switch', async () => {
    render(<VcloakSettingsPage />)
    fireEvent.click(await screen.findByRole('switch', { name: 'vIDE Bridge chats' }))
    await waitFor(() => expect(api.vcloakSetConfig).toHaveBeenCalledWith({ coverBridge: false }))
    fireEvent.click(await screen.findByRole('switch', { name: 'Codex CLI in vIDE terminals' }))
    await waitFor(() => expect(api.vcloakSetConfig).toHaveBeenCalledWith({ coverCodex: false }))
    fireEvent.click(await screen.findByRole('switch', { name: 'AI tools in vIDE terminals' }))
    await waitFor(() => expect(api.vcloakSetConfig).toHaveBeenCalledWith({ coverTerminals: false }))
  })

  it('disables the Codex switch while terminals are not covered', async () => {
    api.vcloakGetState.mockResolvedValue(makeState({ coverTerminals: false }))
    render(<VcloakSettingsPage />)
    expect(await screen.findByRole('switch', { name: 'Codex CLI in vIDE terminals' })).toBeDisabled()
  })

  it('changes how deep hidden folder names are hidden', async () => {
    api.vcloakGetState.mockResolvedValue(makeState({ hiddenFolders: ['/Users/you/Work'] }))
    render(<VcloakSettingsPage />)
    fireEvent.change(await screen.findByLabelText('How deep to hide names'), { target: { value: 'project' } })
    await waitFor(() => expect(api.vcloakSetConfig).toHaveBeenCalledWith({ hiddenDepth: 'project' }))
  })

  it('shows whether a hidden folder can be listed and warns when its replacement shows a root', async () => {
    api.vcloakGetState.mockResolvedValue({
      ...makeState({ hiddenFolders: ['/Users/you/Work', '/Users/you/Old'], hiddenDecoys: { '/Users/you/Work': '/Users/you/ACME-Corp' } }),
      hiddenStatus: [{ path: '/Users/you/Work', listed: true, count: 4 }, { path: '/Users/you/Old', listed: false, count: 0 }],
    })
    render(<VcloakSettingsPage />)
    expect(await screen.findByText(/vCloak can see 4 names inside this folder/)).toBeInTheDocument()
    expect(screen.getByText(/macOS does not let vCloak list this folder/)).toBeInTheDocument()
    expect(screen.getByText(/contains your company root/)).toBeInTheDocument()
  })
})
