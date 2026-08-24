/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { TodoTagInput } from '../TodoTagInput'

afterEach(() => {
  cleanup()
})

describe('TodoTagInput', () => {
  it('renders existing tags as chips', () => {
    render(<TodoTagInput tags={['frontend', 'urgent']} suggestions={[]} onChange={vi.fn()} />)
    expect(screen.getByText('frontend')).toBeInTheDocument()
    expect(screen.getByText('urgent')).toBeInTheDocument()
  })

  it('pressing Enter adds the typed tag and clears the input', () => {
    const onChange = vi.fn()
    render(<TodoTagInput tags={[]} suggestions={[]} onChange={onChange} />)
    const input = screen.getByLabelText('Tags')
    fireEvent.change(input, { target: { value: 'backend' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onChange).toHaveBeenCalledWith(['backend'])
    expect(input).toHaveValue('')
  })

  it('pressing comma also adds the typed tag', () => {
    const onChange = vi.fn()
    render(<TodoTagInput tags={[]} suggestions={[]} onChange={onChange} />)
    const input = screen.getByLabelText('Tags')
    fireEvent.change(input, { target: { value: 'backend' } })
    fireEvent.keyDown(input, { key: ',' })

    expect(onChange).toHaveBeenCalledWith(['backend'])
  })

  it('does not add a tag that already exists (case-insensitive)', () => {
    const onChange = vi.fn()
    render(<TodoTagInput tags={['Backend']} suggestions={[]} onChange={onChange} />)
    const input = screen.getByLabelText('Tags')
    fireEvent.change(input, { target: { value: 'backend' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onChange).not.toHaveBeenCalled()
  })

  it('clicking the remove button on a chip removes that tag', () => {
    const onChange = vi.fn()
    render(<TodoTagInput tags={['frontend', 'urgent']} suggestions={[]} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove tag frontend' }))

    expect(onChange).toHaveBeenCalledWith(['urgent'])
  })

  it('pressing Backspace on an empty input removes the last tag', () => {
    const onChange = vi.fn()
    render(<TodoTagInput tags={['frontend', 'urgent']} suggestions={[]} onChange={onChange} />)
    fireEvent.keyDown(screen.getByLabelText('Tags'), { key: 'Backspace' })

    expect(onChange).toHaveBeenCalledWith(['frontend'])
  })

  it('shows matching suggestions as the user types, excluding already-added tags', () => {
    render(<TodoTagInput tags={['frontend']} suggestions={['frontend', 'frontend-perf', 'backend']} onChange={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Tags'), { target: { value: 'front' } })

    expect(screen.getByRole('button', { name: 'frontend-perf' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'frontend' })).not.toBeInTheDocument()
  })

  it('clicking a suggestion adds it and clears the query', () => {
    const onChange = vi.fn()
    render(<TodoTagInput tags={[]} suggestions={['frontend']} onChange={onChange} />)
    const input = screen.getByLabelText('Tags')
    fireEvent.change(input, { target: { value: 'front' } })
    fireEvent.click(screen.getByRole('button', { name: 'frontend' }))

    expect(onChange).toHaveBeenCalledWith(['frontend'])
    expect(input).toHaveValue('')
  })
})
