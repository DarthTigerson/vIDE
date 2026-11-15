import type { Command } from './commands'
import { useAppContribStore } from '@/apps/appContribStore'
import { usePeekEventStore } from '@/stores/peekEventStore'

// Whether this is an unpackaged (dev) build, asked once from main. Until the
// answer arrives the dev commands are simply not listed.
let devMode: boolean | null = null
let devModeAsked = false

export function askDevMode(): void {
  if (devModeAsked) return
  devModeAsked = true
  void window.api.appsIsDev?.().then((v) => { devMode = v }).catch(() => { devMode = false })
}

// For tests.
export function resetAppCommandsForTests(): void {
  devMode = null
  devModeAsked = false
}

function devCommands(): Command[] {
  const peek = (text: string) => usePeekEventStore.getState().show(text, 'info')
  const load: Command = {
    id: 'app-dev-load-folder',
    label: 'Load app from folder…',
    description: 'Run a store app from a local build folder (dev builds only)',
    keywords: ['store', 'app', 'dev', 'plugin', 'local', 'load'],
    action: () => {
      void window.api.appsLoadDevFolder().then((res) => {
        if (res.ok) peek(`Loaded dev app "${res.id}"`)
        else if (res.error) peek(res.error)
      })
    },
  }
  const unload: Command[] = useAppContribStore.getState().apps
    .filter((a) => a.source === 'dev')
    .map((a) => ({
      id: `app-dev-unload-${a.id}`,
      label: `Unload dev app: ${a.name}`,
      keywords: ['store', 'app', 'dev'],
      action: () => { void window.api.appsUnloadDev(a.id) },
    }))
  return [load, ...unload]
}

// Commands registered by installed store apps (vide.commands.register), plus
// the developer commands in unpackaged builds.
export function appCommands(): Command[] {
  askDevMode()
  const fromApps = useAppContribStore.getState().commands.map((c) => c.command)
  return devMode ? [...fromApps, ...devCommands()] : fromApps
}
