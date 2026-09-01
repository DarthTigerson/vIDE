import { execFile } from 'child_process'
import { promisify } from 'util'
import { resolveBinaryPath } from './lsp/shellPath'

const execFileAsync = promisify(execFile)

// Electron-launched apps (Dock/Finder, not a terminal) don't inherit the
// interactive shell's PATH, so Docker Desktop's CLI (typically symlinked into
// /usr/local/bin or /opt/homebrew/bin) can be invisible to a bare execFile
// even though it's installed and running. Resolve the real path via a login
// shell first; fall back to the bare name so a genuinely missing binary still
// ENOENTs (and correctly reports 'not-installed') rather than silently no-op'ing.
async function dockerBin(): Promise<string> {
  return (await resolveBinaryPath('docker')) ?? 'docker'
}

export type DockerStatus = 'not-installed' | 'stopped' | 'running'

export interface DockerContainer {
  id: string
  name: string
  image: string
  status: string
  state: string
  ports: string
  // Set from the `com.docker.compose.project` label Compose stamps on every
  // container in a stack, so the panel can group them the same way Docker
  // Desktop does. Undefined for containers started outside Compose (plain
  // `docker run`), which render as standalone rows instead of a group.
  project?: string
}

export interface DockerActionResult {
  ok: boolean
  error?: string
}

const COMPOSE_PROJECT_LABEL = 'com.docker.compose.project'

// `docker ps`'s Labels field is a flat "key=value,key=value" string, not JSON.
function parseComposeProject(labels: string | undefined): string | undefined {
  if (!labels) return undefined
  for (const pair of labels.split(',')) {
    const eq = pair.indexOf('=')
    if (eq === -1) continue
    if (pair.slice(0, eq) === COMPOSE_PROJECT_LABEL) return pair.slice(eq + 1)
  }
  return undefined
}

// `docker info` succeeds only when both the CLI is on PATH and the daemon
// is reachable. ENOENT (spawn failed to find the binary at all) means the
// CLI itself isn't installed; any other failure means the CLI exists but
// the daemon isn't running (Docker Desktop/Colima/etc not started).
export async function checkDockerStatus(): Promise<DockerStatus> {
  try {
    await execFileAsync(await dockerBin(), ['info', '--format', '{{.ID}}'], { timeout: 5000 })
    return 'running'
  } catch (err) {
    const code = (err as { code?: string }).code
    return code === 'ENOENT' ? 'not-installed' : 'stopped'
  }
}

export async function listContainers(): Promise<DockerContainer[]> {
  try {
    const { stdout } = await execFileAsync(
      await dockerBin(),
      ['ps', '-a', '--format', '{{json .}}'],
      { timeout: 5000, maxBuffer: 10 * 1024 * 1024 }
    )
    return stdout
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const raw = JSON.parse(line) as Record<string, string>
        return {
          id: raw.ID,
          name: raw.Names,
          image: raw.Image,
          status: raw.Status,
          state: raw.State,
          ports: raw.Ports,
          project: parseComposeProject(raw.Labels),
        }
      })
  } catch {
    return []
  }
}

async function runAction(args: string[]): Promise<DockerActionResult> {
  try {
    await execFileAsync(await dockerBin(), args)
    return { ok: true }
  } catch (err) {
    const stderr = (err as { stderr?: string }).stderr
    return { ok: false, error: stderr?.trim() || 'Command failed' }
  }
}

export async function startContainer(id: string): Promise<DockerActionResult> {
  return runAction(['start', id])
}

export async function stopContainer(id: string): Promise<DockerActionResult> {
  return runAction(['stop', id])
}

export async function restartContainer(id: string): Promise<DockerActionResult> {
  return runAction(['restart', id])
}

// Batched equivalents of start/stop/remove for the panel's group and
// "all containers" controls — one docker invocation for the whole scope
// (`docker stop id1 id2 …`) rather than one round-trip per container.
// `docker start`/`stop` on an already-started/stopped id is a harmless
// no-op, so callers can pass a group's full id list without pre-filtering
// by current state.
export async function startContainers(ids: string[]): Promise<DockerActionResult> {
  return runAction(['start', ...ids])
}

export async function stopContainers(ids: string[]): Promise<DockerActionResult> {
  return runAction(['stop', ...ids])
}

export async function removeContainers(ids: string[]): Promise<DockerActionResult> {
  return runAction(['rm', '-f', ...ids])
}

// -f so a running container can be removed in one step instead of failing
// with "container is running" — the confirmation modal upstream is what
// gives the user a chance to back out, this is just the actual command.
export async function removeContainer(id: string): Promise<DockerActionResult> {
  return runAction(['rm', '-f', id])
}

// Starting the daemon itself (as opposed to a container) isn't a `docker`
// subcommand — it's whatever manages Docker Desktop/Colima/etc on the host,
// which differs per platform. Linux's systemd path generally needs a
// privileged docker group membership or passwordless sudo to succeed
// without a prompt Electron can't surface; when it fails we just report the
// stderr back so the popover can tell the user to start it manually.
export async function openDockerApp(): Promise<DockerActionResult> {
  try {
    if (process.platform === 'darwin') {
      await execFileAsync('open', ['-a', 'Docker'])
      return { ok: true }
    }
    if (process.platform === 'linux') {
      await execFileAsync('systemctl', ['--user', 'start', 'docker'])
      return { ok: true }
    }
    return { ok: false, error: 'Unsupported platform' }
  } catch (err) {
    const stderr = (err as { stderr?: string }).stderr
    return { ok: false, error: stderr?.trim() || 'Failed to start Docker — try starting it manually.' }
  }
}
