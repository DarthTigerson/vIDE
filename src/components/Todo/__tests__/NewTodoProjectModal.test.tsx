/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { NewTodoProjectModal } from '../NewTodoProjectModal'
import { useTodoStore } from '@/stores/todoStore'

const createProjectMock = vi.fn()

beforeEach(() => {
  createProjectMock.mockReset()
  useTodoStore.setState({ createProject: createProjectMock })
})

afterEach(() => {
  cleanup()
})

describe('NewTodoProjectModal', () => {
  it('suggests the project key from the first letter of the name, uppercased', () => {
    render(<NewTodoProjectModal onClose={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'huginn' } })
    expect(screen.getByLabelText('Key')).toHaveValue('H')
  })

  it('stops auto-suggesting the key once the user edits it manually', () => {
    render(<NewTodoProjectModal onClose={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'huginn' } })
    fireEvent.change(screen.getByLabelText('Key'), { target: { value: 'HUG' } })
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'harness' } })
    expect(screen.getByLabelText('Key')).toHaveValue('HUG')
  })

  it('creates the project and closes on Create', async () => {
    createProjectMock.mockResolvedValue({ id: 'p1', name: 'Huginn', key: 'H', nextNumber: 1, createdAt: 1 })
    const onClose = vi.fn()
    render(<NewTodoProjectModal onClose={onClose} />)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Huginn' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => {
      expect(createProjectMock).toHaveBeenCalledWith('Huginn', 'H')
      expect(onClose).toHaveBeenCalled()
    })
  })

  it('shows an error and does not close when creation fails', async () => {
    createProjectMock.mockRejectedValue(new Error('Key already in use'))
    const onClose = vi.fn()
    render(<NewTodoProjectModal onClose={onClose} />)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Huginn' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => {
      expect(screen.getByText('Key already in use')).toBeInTheDocument()
    })
    expect(onClose).not.toHaveBeenCalled()
  })
})
