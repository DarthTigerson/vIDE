import { resolveAndRunStreamed, resolveBinaryPath, resolveVersion } from '../shellPath'
import type { LspServerModule } from '../types'

// Red Hat's yaml-language-server, the same one VS Code's YAML extension and
// most editors use. Its go-to-definition is thin on plain config (it resolves
// YAML anchors/aliases and schema-backed references) — most of its value is
// schema validation and completion, which vIDE doesn't wire today.
export const yamlServer: LspServerModule = {
  id: 'yaml',
  label: 'YAML',
  monacoLanguageIds: ['yaml'],
  ramEstimate: 'typically 80–200MB',

  async detect() {
    const path = await resolveBinaryPath('yaml-language-server')
    if (!path) return { found: false }
    const version = await resolveVersion(path, ['--version'])
    return { found: true, path, version: version ?? undefined }
  },

  async getSpawn() {
    const path = await resolveBinaryPath('yaml-language-server')
    if (!path) return null
    return { command: path, args: ['--stdio'] }
  },

  install(onData) {
    return resolveAndRunStreamed('npm', ['install', '-g', 'yaml-language-server'], onData)
  },
}
