import { request } from 'http'
import type { McpToolDef } from './protocol'
import { createScript, liveScripts, readScriptsData, updateScript, scriptDisplayTitle, type Script } from '../scriptsData'
import { readScriptTags } from '../scriptTags'

const NOT_IN_VIDE = 'run_script only works from a Claude panel inside vIDE; nothing was run.'

function describeScript(script: Script, usedIn: string[], withBody: boolean): string {
  const lines = [
    `id: ${script.id}`,
    `title: ${scriptDisplayTitle(script)}`,
    `description: ${script.description || '(none)'}`,
    `share output: ${script.shareOutput ? 'yes' : 'no'}`,
    `used in: ${usedIn.length ? usedIn.join(', ') : '(not run yet)'}`,
  ]
  if (withBody) lines.push(`body:\n${script.body}`)
  return lines.join('\n')
}

async function findLive(dataDir: string, id: string): Promise<Script> {
  const script = liveScripts(await readScriptsData(dataDir)).find((s) => s.id === id)
  if (!script) throw new Error(`Script "${id}" not found — use list_scripts to see ids`)
  return script
}

// Asks the vIDE window this Claude session belongs to (over the same
// per-window unix socket vide-browser uses) to run a script in a new
// terminal tab, and waits for the formatted result. No request timeout here:
// the main process gives up after 10 minutes itself.
// Shared by the vide-scripts MCP server (Claude) and Bridge's system prompt.
export const SCRIPTS_INSTRUCTIONS =
  "These are the user's saved routines (shell scripts with a title and a description of when to use them). " +
  'When the user asks for something a script describes, offer or use run_script instead of retyping its commands. ' +
  'When asked to write or fix a routine, use create_script / update_script. You cannot delete scripts.'

export function socketRunner(socketPath: string, windowId: string): (scriptId: string) => Promise<string> {
  return (scriptId) =>
    new Promise((resolve, reject) => {
      const body = new URLSearchParams({ id: scriptId }).toString()
      const req = request(
        {
          socketPath,
          path: '/run-script',
          method: 'POST',
          headers: { 'X-Vide-Window-Id': windowId, 'Content-Length': Buffer.byteLength(body) },
        },
        (res) => {
          const chunks: Buffer[] = []
          res.on('data', (chunk: Buffer) => chunks.push(chunk))
          res.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8')
            let parsed: { text?: string; error?: string } = {}
            try { parsed = JSON.parse(text) } catch { /* not JSON */ }
            if ((res.statusCode ?? 0) >= 400) reject(new Error(parsed.error ?? text))
            else resolve(parsed.text ?? text)
          })
        },
      )
      req.on('error', (err) =>
        reject(new Error(`Could not reach vIDE (${err.message}). Is vIDE running, with this window still open?`)),
      )
      req.end(body)
    })
}

export function buildScriptsTools(dataDir: string, run?: (scriptId: string) => Promise<string>): McpToolDef[] {
  return [
    {
      name: 'list_scripts',
      description:
        "List the user's saved vIDE scripts (shell routines) with id, title, description, whether output is shared with you, and the projects each has been run in. Bodies are left out — use read_script.",
      inputSchema: { type: 'object', properties: {} },
      handler: async () => {
        const scripts = liveScripts(await readScriptsData(dataDir))
        if (!scripts.length) return 'No scripts yet.'
        const tags = await readScriptTags(dataDir)
        return scripts.map((s) => describeScript(s, tags[s.id] ?? [], false)).join('\n\n')
      },
    },
    {
      name: 'read_script',
      description: 'Read one script in full, including its shell commands (body).',
      inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      handler: async (args) => {
        const script = await findLive(dataDir, String(args.id))
        const tags = await readScriptTags(dataDir)
        return describeScript(script, tags[script.id] ?? [], true)
      },
    },
    {
      name: 'create_script',
      description:
        'Save a new script. The description should say what it does and when to use it — the user and future sessions rely on it. share_output (default true) controls whether run_script returns the terminal output or only success/failure.',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          body: { type: 'string', description: 'Shell commands, one per line, typed into an interactive shell as-is.' },
          share_output: { type: 'boolean' },
        },
        required: ['title', 'description', 'body'],
      },
      handler: async (args) => {
        const script = await createScript(dataDir, {
          title: String(args.title ?? ''),
          description: String(args.description ?? ''),
          body: String(args.body ?? ''),
          shareOutput: typeof args.share_output === 'boolean' ? args.share_output : undefined,
        })
        return `Created ${script.id}`
      },
    },
    {
      name: 'update_script',
      description: 'Change a script. Only the fields given are changed.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          body: { type: 'string' },
          share_output: { type: 'boolean' },
        },
        required: ['id'],
      },
      handler: async (args) => {
        const script = await updateScript(dataDir, String(args.id), {
          title: typeof args.title === 'string' ? args.title : undefined,
          description: typeof args.description === 'string' ? args.description : undefined,
          body: typeof args.body === 'string' ? args.body : undefined,
          shareOutput: typeof args.share_output === 'boolean' ? args.share_output : undefined,
        })
        return `Updated ${script.id}`
      },
    },
    {
      name: 'run_script',
      description:
        "Run a script in a new terminal tab inside vIDE, where the user can watch it, and wait (up to 10 minutes) for it to finish. Returns the exit status, plus the output only if the script's share output is on — otherwise you only learn success or failure and should ask the user to check the terminal.",
      inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      handler: async (args) => (run ? run(String(args.id)) : NOT_IN_VIDE),
    },
  ]
}
