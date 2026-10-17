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
