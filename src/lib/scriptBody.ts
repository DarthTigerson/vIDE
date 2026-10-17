// Shared by the renderer (typing a script into a terminal) and the main
// process (the marked command `run_script` sends), so both write exactly the
// same text: Unix line endings, no trailing blank lines, one final newline so
// the last command actually runs.
export function normalizeBody(body: string): string {
  const trimmed = body.replace(/\r\n?/g, '\n').replace(/\s+$/, '')
  return trimmed ? trimmed + '\n' : ''
}

export function scriptDisplayTitle(script: { title: string }): string {
  return script.title.trim() || 'Untitled script'
}
