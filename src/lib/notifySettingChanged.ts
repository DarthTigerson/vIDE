// Lightweight bridge so any store can trigger a debounced push without
// importing configRepoStore (which would create a circular dependency).
let _schedulePush: (() => void) | undefined

export function registerPushCallback(fn: () => void): void {
  _schedulePush = fn
}

export function notifySettingChanged(): void {
  _schedulePush?.()
}
