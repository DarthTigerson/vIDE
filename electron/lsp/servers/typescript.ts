import { npmInstallGlobal, resolveNpmBinary } from '../nodeRuntime'
import { resolveVersion } from '../shellPath'
import type { LspServerModule } from '../types'

export const typescriptServer: LspServerModule = {
  id: 'typescript',
  label: 'TypeScript / JavaScript',
  monacoLanguageIds: ['typescript', 'javascript'],
  ramEstimate: 'typically 150–400MB, scales with project size',

  async detect() {
    const path = await resolveNpmBinary('typescript-language-server')
    if (!path) return { found: false }
    const version = await resolveVersion(path, ['--version'])
    return { found: true, path, version: version ?? undefined }
  },

  async getSpawn() {
    const path = await resolveNpmBinary('typescript-language-server')
    if (!path) return null
    return { command: path, args: ['--stdio'] }
  },

  install(onData) {
    return npmInstallGlobal(['typescript-language-server', 'typescript'], onData)
  },
}
