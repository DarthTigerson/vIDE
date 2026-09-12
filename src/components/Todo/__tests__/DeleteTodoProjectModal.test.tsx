/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { DeleteTodoProjectModal } from '../DeleteTodoProjectModal'
import { useTodoStore } from '@/stores/todoStore'
import type { TodoProject } from '@/types/api'

const deleteProjectMock = vi.fn()
const project: TodoProject = { id: 'p1', name: 'vIDE', key: 'H', nextNumber: 3, createdAt: 1 }

beforeEach(() => {
  deleteProjectMock.mockReset()
  useTodoStore.setState({ deleteProject: deleteProjectMock })
})

afterEach(() => {
  cleanup()
})

describe('DeleteTodoProjectModal', () => {
  it('keeps the Move to Trash button disabled until the project name is typed exactly', () => {
    render(<DeleteTodoProjectModal project={project} onClose={vi.fn()} />)
    const confirmInput = screen.getByLabelText(/type.*vIDE.*to confirm/i)
    const deleteButton = screen.getByRole('button', { name: 'Move to Trash' })

    expect(deleteButton).toBeDisabled()

    fireEvent.change(confirmInput, { target: { value: 'vid' } })
    expect(deleteButton).toBeDisabled()

    fireEvent.change(confirmInput, { target: { value: 'vIDE' } })
    expect(deleteButton).toBeEnabled()
  })

  it('deletes the project and closes once confirmed', async () => {
    deleteProjectMock.mockResolvedValue(undefined)
    const onClose = vi.fn()
    render(<DeleteTodoProjectModal project={project} onClose={onClose} />)
    fireEvent.change(screen.getByLabelText(/type.*vIDE.*to confirm/i), { target: { value: 'vIDE' } })
    fireEvent.click(screen.getByRole('button', { name: 'Move to Trash' }))

    await waitFor(() => {
      expect(deleteProjectMock).toHaveBeenCalledWith('p1')
      expect(onClose).toHaveBeenCalled()
    })
  })

  it('shows an error and does not close when deletion fails', async () => {
    deleteProjectMock.mockRejectedValue(new Error('Failed to delete project'))
    const onClose = vi.fn()
    render(<DeleteTodoProjectModal project={project} onClose={onClose} />)
    fireEvent.change(screen.getByLabelText(/type.*vIDE.*to confirm/i), { target: { value: 'vIDE' } })
    fireEvent.click(screen.getByRole('button', { name: 'Move to Trash' }))

    await waitFor(() => {
      expect(screen.getByText('Failed to delete project')).toBeInTheDocument()
    })
    expect(onClose).not.toHaveBeenCalled()
  })
})
