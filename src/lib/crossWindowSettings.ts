// Every vIDE window shares one localStorage, but each store reads it only once,
// at startup, so a setting changed in one window never reached the others
// until they restarted. The browser fires a 'storage' event in every window
// except the one that wrote, so a store that registers its keys here re-reads
// them live.
//
// While a reload runs, notifySettingChanged() is a no-op: the window that made
// the change already scheduled the vIDE Sync push, and a store subscription
// reacting to the reload (e.g. the theme family swapping the background image)
// must not schedule a second one from every other open window.

let applying = 0

export function isApplyingOtherWindowChange(): boolean {
  return applying > 0
}

export function onOtherWindowChange(keys: readonly string[], reload: () => void): void {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return
  window.addEventListener('storage', (e) => {
    if (e.storageArea && e.storageArea !== window.localStorage) return
    // key === null means localStorage.clear(): everything changed.
    if (e.key !== null && !keys.includes(e.key)) return
    applying++
    try {
      reload()
    } finally {
      applying--
    }
  })
}
