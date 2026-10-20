import { useEffect, useRef, useState } from 'react'
import { useAutocompleteSettingsStore, resolveSource } from '@/stores/autocompleteSettingsStore'
import { useAutocompleteRuntimeStore } from '@/stores/autocompleteRuntimeStore'

// Keeps the main process's autocomplete model in line with this window's
// settings: configures the source on mount and on every relevant change,
// auto-starts it at launch ("Start with vIDE"), and restarts it when
// autocomplete is turned back on. Mounted once per window (AutocompleteLifecycle
// below, in App.tsx); main shares one server between windows, so a second
// window's start is a no-op.
export function useAutocompleteLifecycle(): void {
  const settings = useAutocompleteSettingsStore()
  const [totalBytes, setTotalBytes] = useState<number | null>(null)
  // Updated only once a configure lands, so StrictMode's discarded first
  // effect run can't use up the launch auto-start.
  const wasEnabled = useRef<boolean | null>(null)

  useEffect(() => {
    useAutocompleteRuntimeStore.getState().init()
    window.api.getSystemMemoryUsage().then((m) => setTotalBytes(m.totalBytes)).catch(() => setTotalBytes(0))
  }, [])

  const source = totalBytes === null ? undefined : resolveSource(settings, totalBytes)
  const sourceKey = JSON.stringify(source)

  useEffect(() => {
    if (source === undefined) return
    const enabledNow = settings.enabled
    let cancelled = false
    window.api.autocompleteConfigure(source).then((state) => {
      if (cancelled) return
      const firstRun = wasEnabled.current === null
      const justEnabled = wasEnabled.current === false && enabledNow
      wasEnabled.current = enabledNow
      if (!enabledNow || !state.modelOnDisk) return
      // Launch: only a model nobody has started or stopped yet, so opening a
      // second window never revives one the user stopped. Never downloads:
      // a missing model waits for the user's button press.
      const autoStart = firstRun && settings.autoStart && state.phase === 'idle'
      if (autoStart || justEnabled) window.api.autocompleteStart()
    }).catch(() => {})
    return () => { cancelled = true }
    // sourceKey stands in for `source`, which is a new object every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey])
}

// Rendered once in App.tsx: a component of its own, so editing an
// autocomplete setting (typing a server URL) re-renders only this.
export function AutocompleteLifecycle(): null {
  useAutocompleteLifecycle()
  return null
}
