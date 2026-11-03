/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { FileRow } from '../FileRow'

afterEach(cleanup)

const noop = () => {}

describe('FileRow', () => {
  it('shows the file name for a file path', () => {
    render(<FileRow file={{ path: 'src/a.ts', status: 'M' }} staged={false} onToggle={noop} onOpenDiff={noop} onContextMenu={noop} />)
    expect(screen.getByText('a.ts')).toBeInTheDocument()
  })

  it('shows a folder entry (a nested repo, `?? nested/`) by its name instead of a blank row', () => {
    render(<FileRow file={{ path: 'tools/nested/', status: '?' }} staged={false} onToggle={noop} onOpenDiff={noop} onContextMenu={noop} />)
    expect(screen.getByText('nested/')).toBeInTheDocument()
  })
})
