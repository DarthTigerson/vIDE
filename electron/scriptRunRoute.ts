import { randomUUID } from 'crypto'
import { liveScripts, readScriptsData } from './scriptsData'
import { buildMarkedCommand, formatRunResult, waitForScriptResult } from './scriptRun'

export interface ScriptRunRequest {
  terminalId: string
  scriptId: string
  command: string
}

export interface RunScriptDeps {
  dataDir: string
  timeoutMs: number
  watch: (windowId: number, terminalId: string, onData: (data: string) => void, onExit: () => void) => () => void
  // false when the window no longer exists.
  sendRunRequest: (windowId: number, req: ScriptRunRequest) => boolean
}

// The bridge's /run-script route (vide-scripts run_script). The terminal id
// is chosen here so its output can be watched *before* the window opens the
// tab and spawns the shell — nothing the script prints is missed.
export async function handleRunScriptRequest(deps: RunScriptDeps, windowId: number, body: string): Promise<{ text: string }> {
  const id = new URLSearchParams(body).get('id') ?? ''
  const script = liveScripts(await readScriptsData(deps.dataDir)).find((s) => s.id === id)
  if (!script) throw new Error(`Script "${id}" not found — use list_scripts to see ids`)

  const token = randomUUID().slice(0, 8)
  const terminalId = `script-${token}`
  let cancel: () => void = () => {}
  const result = waitForScriptResult({
    token,
    timeoutMs: deps.timeoutMs,
    subscribe: (onData, onExit) => {
      cancel = onExit
      return deps.watch(windowId, terminalId, onData, onExit)
    },
  })

  if (!deps.sendRunRequest(windowId, { terminalId, scriptId: script.id, command: buildMarkedCommand(script.body, token) })) {
    cancel()
    throw new Error('The vIDE window this Claude session belongs to is no longer open; nothing was run.')
  }
  return { text: formatRunResult(script, await result) }
}
