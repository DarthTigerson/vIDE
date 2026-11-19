// The Git panel's remote launcher moved to the Git Page store app (id
// `gitpage`). Its one setting moves with it, into the app's own
// `vide:<appId>:` namespace, so an upgrade keeps the user's choice.
// Spec: docs/superpowers/specs/2026-11-19-gitpage-app-design.md

const MOVES: [from: string, to: string][] = [
  ['vide:gitRemote:closeSidePanel', 'vide:gitpage:closeSidePanel'],
]

type KeyStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

// Idempotent: copies each old value unless the app already has one, then drops the old key.
export function migrateGitRemoteSettings(store: KeyStore): void {
  for (const [from, to] of MOVES) {
    const old = store.getItem(from)
    if (old === null) continue
    if (store.getItem(to) === null) store.setItem(to, old)
    store.removeItem(from)
  }
}
