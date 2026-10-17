/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

vi.mock('@monaco-editor/react', () => ({ default: () => <div data-testid="monaco" /> }))

import { ScriptEditorPage } from '../ScriptEditorPage'
import { useScriptsStore } from '@/stores/scriptsStore'

afterEach(() => cleanup())

describe('ScriptEditorPage', () => {
  it('renders a brand-new script that has no project tags yet', () => {
    useScriptsStore.setState({
      scripts: [{ id: 'n', title: 'Untitled script', description: '', body: '', shareOutput: true, createdAt: 1, updatedAt: 1 }],
      tags: {},
      loaded: true,
    })
    render(<ScriptEditorPage scriptId="n" monacoTheme="vs-dark" beforeMount={() => {}} fontSize={13} font="mono" />)
    expect(screen.getByLabelText('Script title')).toHaveValue('Untitled script')
  })
})

describe('ScriptEditorPage layout', () => {
  it('shows editable name/description fields, project chips and a Run in terminal button', () => {
    useScriptsStore.setState({
      scripts: [{ id: 'p', title: 'Pre Commit', description: 'Run before branching', body: 'pre-commit run', shareOutput: false, createdAt: 1, updatedAt: 1 }],
      tags: { p: ['/Users/t/work-api'] },
      loaded: true,
    })
    render(<ScriptEditorPage scriptId="p" monacoTheme="vs-dark" beforeMount={() => {}} fontSize={13} font="mono" />)
    expect(screen.getByLabelText('Script title')).toHaveValue('Pre Commit')
    expect(screen.getByLabelText('Script description')).toHaveValue('Run before branching')
    expect(screen.getByText('work-api')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove /Users/t/work-api' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Run in terminal' })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Claude sees the output' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByText('1 line')).toBeInTheDocument()
  })
})
