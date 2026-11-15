/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import {
  BlamePreview, InlineDiffPreview, ForcePushPreview, GitLogPreview, FetchPreview, GraphTabsPreview, RemotePreview,
} from '../gitPreviews'
import { useEditorSettingsStore } from '@/stores/editorSettingsStore'
import { useGitSettingsStore } from '@/stores/gitSettingsStore'
import { useGitRemoteUrlStore } from '@/stores/gitRemoteUrlStore'
import { useGitReposStore } from '@/stores/gitReposStore'
import { useFileStore } from '@/stores/fileStore'
import { useGeneralSettingsStore } from '@/stores/generalSettingsStore'

const BLAME = 'Thomas, 2 days ago · Fixed sync auth'

beforeEach(() => {
  useFileStore.setState({ projectRoot: null })
  useGitRemoteUrlStore.setState({ urls: {} })
  useGitReposStore.setState({ repos: [], selectedRepo: null })
})
afterEach(cleanup)

describe('BlamePreview', () => {
  it('shows blame in the footer, in the editor, or not at all', () => {
    useEditorSettingsStore.setState({ blameAnnotationsEnabled: true, blameDisplayMode: 'footer' })
    const { rerender } = render(<BlamePreview />)
    expect(screen.getByText(BLAME).closest('[data-mini-footer]')).not.toBeNull()

    useEditorSettingsStore.setState({ blameDisplayMode: 'editor' })
    rerender(<BlamePreview />)
    expect(screen.getByText(BLAME).closest('[data-mini-footer]')).toBeNull()

    useEditorSettingsStore.setState({ blameAnnotationsEnabled: false })
    rerender(<BlamePreview />)
    expect(screen.queryByText(BLAME)).toBeNull()
  })
})

describe('InlineDiffPreview', () => {
  it('uses the real highlight classes while on, gutter only while off, and shows the footer icon', () => {
    useEditorSettingsStore.setState({ inlineDiffEnabled: true, inlineDiffFooterIcon: true })
    const { rerender } = render(<InlineDiffPreview />)
    const preview = screen.getByTestId('inline-diff-preview')
    expect(preview.querySelector('.git-inline-diff-modified')).not.toBeNull()
    expect(preview.querySelector('.git-line-added')).not.toBeNull()
    expect(preview.querySelector('.git-line-deleted')).toBeNull()
    expect(screen.getByTestId('inline-diff-preview-icon')).toBeInTheDocument()

    useEditorSettingsStore.setState({ inlineDiffEnabled: false, inlineDiffFooterIcon: false })
    rerender(<InlineDiffPreview />)
    expect(preview.querySelector('.git-inline-diff-modified')).toBeNull()
    expect(preview.querySelector('.git-gutter-modified')).not.toBeNull()
    expect(screen.queryByTestId('inline-diff-preview-icon')).toBeNull()
  })
})

describe('ForcePushPreview', () => {
  it('reflects the confirm, countdown and auto-continue settings', () => {
    useGitSettingsStore.setState({ forceSafetyEnabled: true, countdownEnabled: false, countdownSeconds: 5, autoContinueOnCountdownEnd: false })
    const { rerender } = render(<ForcePushPreview />)
    expect(screen.getByText('Force push')).toBeInTheDocument()

    useGitSettingsStore.setState({ countdownEnabled: true })
    rerender(<ForcePushPreview />)
    expect(screen.getByText('Confirm (5)')).toBeInTheDocument()

    useGitSettingsStore.setState({ autoContinueOnCountdownEnd: true })
    rerender(<ForcePushPreview />)
    expect(screen.getByText('Pushing in 5s')).toBeInTheDocument()

    useGitSettingsStore.setState({ forceSafetyEnabled: false })
    rerender(<ForcePushPreview />)
    expect(screen.getByText(/Runs straight away/)).toBeInTheDocument()
  })
})

describe('GitLogPreview', () => {
  it('puts Git Log in front every time, or behind with a dot', () => {
    useGitSettingsStore.setState({ gitLogAutoShow: 'always' })
    const { rerender } = render(<GitLogPreview />)
    expect(screen.getByText('Git Log')).toHaveAttribute('data-active', 'true')

    useGitSettingsStore.setState({ gitLogAutoShow: 'onError' })
    rerender(<GitLogPreview />)
    expect(screen.getByText('Git Log')).not.toHaveAttribute('data-active')
  })
})

describe('FetchPreview', () => {
  it('shows the interval while on and a manual hint while off', () => {
    useGitSettingsStore.setState({ periodicFetchEnabled: true, periodicFetchIntervalMinutes: 10 })
    const { rerender } = render(<FetchPreview />)
    expect(screen.getByText(/every 10 min/)).toBeInTheDocument()

    useGitSettingsStore.setState({ periodicFetchEnabled: false })
    rerender(<FetchPreview />)
    expect(screen.getByText(/fetch manually/)).toBeInTheDocument()
  })
})

describe('GraphTabsPreview', () => {
  it('lands the Graph tab in the biggest pane or the focused one', () => {
    useGeneralSettingsStore.setState({ newTabPane: 'biggest' })
    const { rerender } = render(<GraphTabsPreview />)
    expect(screen.getByText('Graph').closest('[data-pane]')).toHaveAttribute('data-pane', 'big')

    useGeneralSettingsStore.setState({ newTabPane: 'active' })
    rerender(<GraphTabsPreview />)
    expect(screen.getByText('Graph').closest('[data-pane]')).toHaveAttribute('data-pane', 'focused')
  })
})

describe('RemotePreview', () => {
  it('names the host from the active repo\'s remote', () => {
    useGitReposStore.setState({ repos: ['/repo/a'], selectedRepo: '/repo/a' })
    useGitRemoteUrlStore.setState({ urls: { '/repo/a': 'https://gitlab.com/acme/widgets' } })
    const { rerender } = render(<RemotePreview />)
    expect(screen.getByText('Open GitLab')).toBeInTheDocument()

    useGitRemoteUrlStore.setState({ urls: { '/repo/a': 'https://git.corp.internal/acme/widgets' } })
    rerender(<RemotePreview />)
    expect(screen.getByText('Open Repository')).toBeInTheDocument()

    useGitRemoteUrlStore.setState({ urls: { '/repo/a': null } })
    rerender(<RemotePreview />)
    expect(screen.getByText('This repo has no git remote.')).toBeInTheDocument()
  })

  it('asks for a repo when none is active', () => {
    render(<RemotePreview />)
    expect(screen.getByText('Open a repo to see its launcher.')).toBeInTheDocument()
  })
})
