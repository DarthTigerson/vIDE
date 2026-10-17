import type { Script } from '@/types/api'
import { normalizeBody, scriptDisplayTitle } from '@/lib/scriptBody'
import { pendingTerminalCommands } from '@/lib/pendingTerminalCommands'
import { buildTerminalPath } from '@/components/Settings/paths'
import { useEditorStore } from '@/stores/editorStore'
import { useFileStore } from '@/stores/fileStore'
import { useScriptsStore } from '@/stores/scriptsStore'
import { useClaudeStore } from '@/stores/claudeStore'
import { TERMINAL_KIND } from '@/lib/agentKinds'

// Running a script = typing its body into a shell, as if the user had. Every
// run tags the script with the current project so it sorts first here next
// time.
function tagWithProject(script: Script): void {
  const root = useFileStore.getState().projectRoot
  if (root) void useScriptsStore.getState().addTag(script.id, root)
}

export function runScriptInTerminal(script: Script, terminalId: string): void {
  const text = normalizeBody(script.body)
  if (text) window.api.termWrite(terminalId, text)
  tagWithProject(script)
}

// `command` overrides the plain body — run_script passes the body with its
// exit-code marker appended, and its own terminal id so the main process can
// watch that PTY before it exists.
export function runScriptInNewTerminal(script: Script, command?: string, terminalId?: string): string {
  const id = terminalId ?? `script-${Date.now().toString(36)}`
  const text = command ?? normalizeBody(script.body)
  if (text) pendingTerminalCommands.set(id, text)
  useScriptsStore.getState().setTerminalTitle(id, scriptDisplayTitle(script))
  useEditorStore.getState().openTab({ path: buildTerminalPath(id), content: '', dirty: false })
  tagWithProject(script)
  return id
}

// From the agent bar's "+ › Scripts": a new terminal session in the agent
// bar (named after the script) instead of an editor tab. Its PTY id is the
// session id, so the queued command runs once that terminal spawns.
export function runScriptInAgentTerminal(script: Script, cwd: string): string {
  const claude = useClaudeStore.getState()
  const id = claude.newSession(cwd, TERMINAL_KIND)
  const text = normalizeBody(script.body)
  if (text) pendingTerminalCommands.set(id, text)
  useClaudeStore.getState().renameInstance(cwd, id, scriptDisplayTitle(script))
  useClaudeStore.getState().setChatVisible(true)
  tagWithProject(script)
  return id
}
