/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { RenameTodoProjectModal } from '../RenameTodoProjectModal'
import { useTodoStore } from '@/stores/todoStore'
import type { TodoProject } from '@/types/api'

const renameProjectMock = vi.fn()
const project: TodoProject = { id: 'p1', name: 'vIDE', key: 'H', nextNumber: 3, createdAt: 1 }

beforeEach(() => {
  renameProjectMock.mockReset()
  useTodoStore.setState({ renameProject: renameProjectMock })
})

afterEach(() => {
  cleanup()
})

describe('RenameTodoProjectModal', () => {
  it('prefills the name and key from the project', () => {
    render(<RenameTodoProjectModal project={project} onClose={vi.fn()} />)
    expect(screen.getByLabelText('Name')).toHaveValue('vIDE')
    expect(screen.getByLabelText('Key')).toHaveValue('H')
  })

  it('renames the project and closes on Save', async () => {
    renameProjectMock.mockResolvedValue({ ...project, name: 'vIDE 2', key: 'V2' })
    const onClose = vi.fn()
    render(<RenameTodoProjectModal project={project} onClose={onClose} />)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'vIDE 2' } })
    fireEvent.change(screen.getByLabelText('Key'), { target: { value: 'V2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(renameProjectMock).toHaveBeenCalledWith('p1', 'vIDE 2', 'V2')
      expect(onClose).toHaveBeenCalled()
    })
  })

  it('shows an error and does not close when the rename is rejected', async () => {
    renameProjectMock.mockRejectedValue(new Error('A project named "Harness" already exists'))
    const onClose = vi.fn()
    render(<RenameTodoProjectModal project={project} onClose={onClose} />)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Harness' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(screen.getByText('A project named "Harness" already exists')).toBeInTheDocument()
    })
    expect(onClose).not.toHaveBeenCalled()
  })
})
