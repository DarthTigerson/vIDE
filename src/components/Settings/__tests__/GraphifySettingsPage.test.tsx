import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GraphifySettingsPage } from '../GraphifySettingsPage'
import { useGraphifyStore } from '@/stores/graphifyStore'
import { useGraphifySettingsStore } from '@/stores/graphifySettingsStore'

const { getProjectRoot, setProjectRoot } = vi.hoisted(() => {
  let projectRoot: string | null = '/project'
  return {
    getProjectRoot: () => projectRoot,
    setProjectRoot: (value: string | null) => {
      projectRoot = value
    },
  }
})

vi.mock('@/stores/fileStore', () => ({
  useFileStore: (selector: (s: { projectRoot: string | null }) => unknown) =>
    selector({ projectRoot: getProjectRoot() }),
}))

function resetStore() {
  useGraphifyStore.setState({
    installingSkill: false,
    skillInstallResult: null,
    installClaudeSkill: vi.fn(),
  })
}

describe('GraphifySettingsPage', () => {
  beforeEach(() => {
    resetStore()
    setProjectRoot('/project')
    useGraphifySettingsStore.setState({ autoBuildOnOpen: false })
  })

  it('calls installClaudeSkill with the current project root', () => {
    const installMock = vi.fn()
    useGraphifyStore.setState({ installClaudeSkill: installMock })
    render(<GraphifySettingsPage />)

    fireEvent.click(screen.getByRole('button', { name: /enable for claude code/i }))

    expect(installMock).toHaveBeenCalledWith('/project')
  })

  it('disables the button when there is no project open', () => {
    setProjectRoot(null)
    render(<GraphifySettingsPage />)

    expect(screen.getByRole('button', { name: /enable for claude code/i })).toBeDisabled()
  })

  it('disables and relabels the button while an install is in flight', () => {
    useGraphifyStore.setState({ installingSkill: true })
    render(<GraphifySettingsPage />)

    expect(screen.getByRole('button', { name: /enabling/i })).toBeDisabled()
  })

  it('shows a success message once the Claude skill install succeeds', () => {
    useGraphifyStore.setState({ skillInstallResult: { ok: true, output: 'skill installed' } })
    render(<GraphifySettingsPage />)

    expect(screen.getByText(/claude code can now use graphify/i)).toBeInTheDocument()
  })

  it('shows the captured failure output when the Claude skill install fails', () => {
    useGraphifyStore.setState({ skillInstallResult: { ok: false, output: 'error: not a git repository' } })
    render(<GraphifySettingsPage />)

    expect(screen.getByText(/failed to enable graphify for claude code/i)).toBeInTheDocument()
    expect(screen.getByText(/not a git repository/)).toBeInTheDocument()
  })

  it('auto-build-on-open toggle is off by default and shows no resource warning', () => {
    render(<GraphifySettingsPage />)
    const toggle = screen.getByRole('switch', { name: /auto-build graph when a repo is opened/i })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    expect(screen.queryByText(/spawns a real CLI process/)).not.toBeInTheDocument()
  })

  it('turning on auto-build-on-open shows a resource-usage warning', () => {
    render(<GraphifySettingsPage />)
    fireEvent.click(screen.getByRole('switch', { name: /auto-build graph when a repo is opened/i }))

    expect(useGraphifySettingsStore.getState().autoBuildOnOpen).toBe(true)
    expect(screen.getByText(/spawns a real CLI process/)).toBeInTheDocument()
  })

  it('turning auto-build-on-open back off hides the warning', () => {
    useGraphifySettingsStore.setState({ autoBuildOnOpen: true })
    render(<GraphifySettingsPage />)
    fireEvent.click(screen.getByRole('switch', { name: /auto-build graph when a repo is opened/i }))

    expect(useGraphifySettingsStore.getState().autoBuildOnOpen).toBe(false)
    expect(screen.queryByText(/spawns a real CLI process/)).not.toBeInTheDocument()
  })
})
