#!/usr/bin/env node
import { existsSync } from 'fs'
import { execFileSync } from 'child_process'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(__dirname, '..')
const plistPath = join(repoRoot, 'node_modules/electron/dist/Electron.app/Contents/Info.plist')

function main() {
  if (process.platform !== 'darwin') return
  if (!existsSync(plistPath)) return // electron not installed yet, or non-mac CI

  const currentName = execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleName', plistPath], {
    encoding: 'utf-8',
  }).trim()
  if (currentName === 'vIDE') return // already rebranded, idempotent no-op

  for (const key of ['CFBundleName', 'CFBundleDisplayName']) {
    execFileSync('/usr/libexec/PlistBuddy', ['-c', `Set :${key} vIDE`, plistPath])
  }
  console.log('[rebrand-electron] Patched dev Electron.app bundle name to "vIDE".')
}

try {
  main()
} catch (err) {
  console.warn('[rebrand-electron] Skipped (non-fatal):', err.message)
}
