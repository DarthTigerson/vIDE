// Runs before `npm run dev` / `npm run build`. After pulling a branch that adds
// or bumps a dependency, node_modules is stale until someone runs `npm install`,
// and Vite fails with "Failed to resolve import". This checks every direct
// dependency against the version package-lock.json expects and runs
// `npm install` only when one is missing or different, so the common case
// (nothing changed) costs a few file reads.
import { existsSync, readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const readJson = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'))

const pkg = readJson('package.json')
const lock = existsSync(join(root, 'package-lock.json')) ? readJson('package-lock.json') : null
const names = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })

const stale = names.filter((name) => {
  const installedPath = join(root, 'node_modules', name, 'package.json')
  if (!existsSync(installedPath)) return true
  const expected = lock?.packages?.[`node_modules/${name}`]?.version
  if (!expected) return false
  return JSON.parse(readFileSync(installedPath, 'utf8')).version !== expected
})

if (stale.length > 0) {
  console.log(`[ensure-deps] Out of date: ${stale.join(', ')} — running npm install`)
  execSync('npm install', { cwd: root, stdio: 'inherit' })
}
