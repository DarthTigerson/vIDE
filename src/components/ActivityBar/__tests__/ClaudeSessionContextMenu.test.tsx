import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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
})
