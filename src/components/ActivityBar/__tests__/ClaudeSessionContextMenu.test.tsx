import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ClaudeSessionContextMenu } from '../ClaudeSessionContextMenu'

vi.mock('@/lib/nativeViewCover', () => ({ useCoverNativeViews: () => {} }))

const noop = () => {}
const props = {
  x: 10, y: 10, onRename: noop, onContinuePreviousSession: noop, onResumeSession: noop, onRestorePrevious: noop,
  onCompact: noop, onClear: noop, onCloseSession: noop, onCloseAllSessions: noop, onClose: noop,
}

describe('ClaudeSessionContextMenu', () => {
  it('Claude sessions get Continue/Resume/Compact', () => {
    render(<ClaudeSessionContextMenu {...props} kind="claude" />)
    expect(screen.getByText('Continue Previous Session')).toBeInTheDocument()
    expect(screen.getByText('Resume Session…')).toBeInTheDocument()
    expect(screen.getByText('Compact')).toBeInTheDocument()
    expect(screen.queryByText('Restore Previous Conversation')).toBeNull()
  })

  it('Bridge/llama sessions get Restore Previous Conversation and no Compact', () => {
    render(<ClaudeSessionContextMenu {...props} kind="llama:q1" />)
    expect(screen.getByText('Restore Previous Conversation')).toBeInTheDocument()
    expect(screen.queryByText('Continue Previous Session')).toBeNull()
    expect(screen.queryByText('Compact')).toBeNull()
    expect(screen.getByText('Clear')).toBeInTheDocument()
  })

  it('terminal sessions get only Rename, Clear and the Close options', () => {
    render(<ClaudeSessionContextMenu {...props} kind="terminal" />)
    for (const gone of ['Continue Previous Session', 'Resume Session…', 'Restore Previous Conversation', 'Compact']) {
      expect(screen.queryByText(gone)).toBeNull()
    }
    expect(screen.getByText('Rename…')).toBeInTheDocument()
    expect(screen.getByText('Clear')).toBeInTheDocument()
    expect(screen.getByText('Close Session')).toBeInTheDocument()
  })
})

describe('ClaudeSessionContextMenu — Close Other Sessions', () => {
  it('shows the row when a handler is given and calls it', () => {
    const onCloseOtherSessions = vi.fn()
    render(<ClaudeSessionContextMenu {...props} kind="claude" onCloseOtherSessions={onCloseOtherSessions} />)
    fireEvent.click(screen.getByText('Close Other Sessions'))
    expect(onCloseOtherSessions).toHaveBeenCalled()
  })

  it('hides the row when there are no other sessions (no handler)', () => {
    render(<ClaudeSessionContextMenu {...props} kind="bridge" />)
    expect(screen.queryByText('Close Other Sessions')).toBeNull()
  })
})
