export interface SelectionForAssistant {
  relPath: string
  startLine: number
  endLine: number
  language: string
  code: string
}

export function toRelativePath(absPath: string, projectRoot: string | null): string {
  if (!projectRoot) return absPath
  const prefix = projectRoot.endsWith('/') ? projectRoot : `${projectRoot}/`
  return absPath.startsWith(prefix) ? absPath.slice(prefix.length) : absPath
}

export function formatSelectionForAssistant({ relPath, startLine, endLine, language, code }: SelectionForAssistant): string {
  const lineLabel = startLine === endLine ? `line ${startLine}` : `lines ${startLine}-${endLine}`
  return `In ${relPath} (${lineLabel}):\n\`\`\`${language}\n${code}\n\`\`\``
}

// A terminal selection has no file or line range to cite, so it's labelled as
// terminal output instead.
export function formatTerminalSelectionForAssistant(text: string): string {
  return `Terminal output:\n\`\`\`\n${text}\n\`\`\``
}

// The bracketed-paste protocol every real terminal uses to deliver a
// multi-line paste to a foreground CLI in one shot, so embedded newlines
// aren't read as separate keystrokes/submits by the CLI's line editor.
export const BRACKETED_PASTE_START = '\x1b[200~'
export const BRACKETED_PASTE_END = '\x1b[201~'

export function wrapBracketedPaste(text: string): string {
  // Strip C0 control characters (other than \n/\t, which are legitimate in
  // selected code) and DEL before wrapping. Without this, a selection
  // containing a literal ESC byte could forge the bracketed-paste end
  // sequence (or another escape sequence) and terminate the paste early from
  // the receiving CLI's point of view — everything written after it in the
  // same write() call would then be interpreted as live keystrokes,
  // including a literal \r that submits, silently auto-submitting
  // attacker-controlled input to a tool-executing CLI.
  const safe = text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
  return `${BRACKETED_PASTE_START}${safe}${BRACKETED_PASTE_END}`
}
