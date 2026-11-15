import { McpStdioServer } from './protocol'
import { appInstructions, appToolsFromList, fetchAppToolList, socketAppToolCaller, type AppToolGroup } from './appsTools'

// Like vide-browser, relies on VIDE_WINDOW_ID / VIDE_BROWSER_SHIM_SOCK
// inherited from a vIDE-spawned claude. The tool list comes from vIDE at
// start (installed + enabled apps), so a newly installed app shows up in the
// next session. Outside such a session, or if vIDE can't be reached, it
// serves zero tools rather than failing the CLI's startup.
async function main(): Promise<void> {
  const windowId = process.env.VIDE_WINDOW_ID
  const socketPath = process.env.VIDE_BROWSER_SHIM_SOCK
  let apps: AppToolGroup[] = []
  if (windowId && socketPath) {
    try { apps = await fetchAppToolList(socketPath, windowId) } catch { /* zero tools */ }
  }
  const call = socketPath && windowId ? socketAppToolCaller(socketPath, windowId) : async () => ''
  const instructions = appInstructions(apps).join('\n\n')
  new McpStdioServer({
    name: 'vide-apps',
    version: '1.0.0',
    ...(instructions ? { instructions } : {}),
    tools: appToolsFromList(apps, call),
    input: process.stdin,
    output: process.stdout,
  }).start()
}

void main()
