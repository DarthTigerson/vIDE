import { isApplyingOtherWindowChange } from './crossWindowSettings'

// Lightweight bridge so any store can trigger a debounced push without
// importing configRepoStore (which would create a circular dependency).
let _schedulePush: (() => void) | undefined
let _scheduleNotePush: (() => void) | undefined

export function registerPushCallback(fn: () => void): void {
  _schedulePush = fn
}

export function registerNotePushCallback(fn: () => void): void {
  _scheduleNotePush = fn
}

export function notifySettingChanged(): void {
  // Another window made this change and already scheduled its own push.
  if (isApplyingOtherWindowChange()) return
  _schedulePush?.()
}

// Called when note content is saved — uses a longer debounce so a
// push isn't fired on every keystroke while the user is writing.
export function notifyNoteChanged(): void {
  _scheduleNotePush?.()
}
