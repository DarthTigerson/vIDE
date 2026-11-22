// Monaco's `editor.addCommand` registers the key on a keybinding service that
// every editor shares, with no condition tying it to the editor it was called
// on. With split panes, each pane registers the same key and one pane's handler
// wins for all of them (find always opened in the leftmost pane). Scoping the
// binding to `editorId` - the same condition Monaco's own `addAction` uses -
// makes each key run the handler of the editor that has focus.
interface CommandEditor {
  getId(): string
  addCommand(keybinding: number, handler: () => void, context?: string): string | null
}

export function addEditorCommand(editor: CommandEditor, keybinding: number, handler: () => void): string | null {
  return editor.addCommand(keybinding, handler, `editorId == '${editor.getId()}'`)
}
