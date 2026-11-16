import type { LspInstallMethod } from '../../electron/lsp/catalog'

// What the Store shows before install, e.g. `npm install -g pyright`: the
// exact source of a language server (electron/lsp/installMethods.ts runs it).
export function installSourceText(install: LspInstallMethod): string {
  switch (install.method) {
    case 'npm': return `npm install -g ${install.packages.join(' ')}`
    case 'go': return `go install ${install.package}`
    case 'github-release': return `Download from github.com/${install.repo} releases`
  }
}
