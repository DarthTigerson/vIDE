import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent, screen } from '@testing-library/react'
import { CommitDetailsPanel } from '../CommitDetailsPanel'
import { useSidebarUiStore } from '@/stores/sidebarUiStore'
import type { GitCommit } from '@/types/index'

const commit: GitCommit = {
  hash: 'abc123def456',
  subject: 'Fix bug',
  author: 'Test Author',
  date: '2026-01-01T00:00:00Z',
  parents: ['parent1'],
  refs: [],
}

beforeEach(() => {
  ;(global as any).window.api = {
    gitShowStat: vi.fn().mockResolvedValue(['src/components/App.tsx']),
    readFile: vi.fn().mockResolvedValue(''),
  }
  useSidebarUiStore.setState({ revealRequest: null })
})

afterEach(() => {
  cleanup()
})

describe('CommitDetailsPanel — Reveal in File Tree', () => {
  it('shows "Reveal in File Tree" on right-click and requests a reveal for the full path', async () => {
    render(<CommitDetailsPanel cwd="/proj" commit={commit} onClose={() => {}} />)

    const fileRow = await screen.findByText('src/components/App.tsx')
    fireEvent.contextMenu(fileRow)

    const revealButton = await screen.findByText('Reveal in Site Tree')
    fireEvent.click(revealButton)

    expect(useSidebarUiStore.getState().revealRequest).toEqual({
      path: '/proj/src/components/App.tsx',
    })
  })
})
