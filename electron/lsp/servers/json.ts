import { resolveAndRunStreamed, resolveBinaryPath, resolveVersion } from '../shellPath'
import type { LspServerModule } from '../types'

// vscode-json-language-server, shipped in the maintained
// vscode-langservers-extracted bundle (the same JSON service VS Code uses).
// Go-to-definition here mainly means following `$ref` pointers inside JSON
// Schema documents; the bulk of the server's value is schema validation and
// completion, which vIDE doesn't wire today.
export const jsonServer: LspServerModule = {
  id: 'json',
  label: 'JSON',
  monacoLanguageIds: ['json'],
  ramEstimate: 'typically 60–150MB',

  async detect() {
    const path = await resolveBinaryPath('vscode-json-language-server')
    if (!path) return { found: false }
    const version = await resolveVersion(path, ['--version'])
    return { found: true, path, version: version ?? undefined }
  },

  async getSpawn() {
    const path = await resolveBinaryPath('vscode-json-language-server')
    if (!path) return null
    return { command: path, args: ['--stdio'] }
  },

  install(onData) {
    return resolveAndRunStreamed('npm', ['install', '-g', 'vscode-langservers-extracted'], onData)
  },
}
