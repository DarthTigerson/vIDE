import { describe, expect, it, vi } from 'vitest'
import { addEditorCommand } from '../editorCommand'

describe('addEditorCommand', () => {
  it('scopes the keybinding to the editor it was added to', () => {
    // Monaco's addCommand registers on a keybinding service shared by every
    // editor; without a context, the first split pane's handler wins (VIDE: find
    // always opened in the left pane).
    const addCommand = vi.fn(() => 'DYNAMIC_1')
    const editor = { getId: () => 'vs.editor.ICodeEditor:3', addCommand }
    const handler = () => {}
    addEditorCommand(editor, 2084, handler)
    expect(addCommand).toHaveBeenCalledWith(2084, handler, "editorId == 'vs.editor.ICodeEditor:3'")
  })
})
