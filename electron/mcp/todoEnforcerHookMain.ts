import { decideStopAction, type StopHookInput } from './todoEnforcerHook'

// Standalone entry point invoked by the vide-todo-enforcer plugin's Stop
// hook (see mcpRegistration.ts, which generates the hooks.json command that
// runs this file). Runs outside Electron entirely (via
// ELECTRON_RUN_AS_NODE=1, exactly like todoMcpServer.ts), with the data
// directory passed as argv[2] rather than resolved via app.getPath or an
// env var — Claude Code hook entries can't declare their own env vars, so
// vIDE bakes this path into the generated command string instead.
async function readStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

async function main(): Promise<void> {
  const dataDir = process.argv[2]
  if (!dataDir) {
    process.stderr.write('todoEnforcerHookMain: missing data directory argument\n')
    return
  }

  let input: StopHookInput
  try {
    input = JSON.parse(await readStdin())
  } catch {
    // Malformed/empty stdin — fail open by treating this as an already-forced
    // continuation, rather than risk blocking on input we can't reason about.
    input = { stop_hook_active: true }
  }

  const decision = await decideStopAction(dataDir, input)
  if (decision) process.stdout.write(JSON.stringify(decision))
}

void main()
