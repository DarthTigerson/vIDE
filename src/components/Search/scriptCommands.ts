import type { Command } from './commands'
import { useScriptsStore } from '@/stores/scriptsStore'
import { useScriptsSettingsStore } from '@/stores/scriptsSettingsStore'
import { useFileStore } from '@/stores/fileStore'
import { orderScriptsForProject } from '@/lib/scriptOrder'
import { scriptDisplayTitle } from '@/lib/scriptBody'
import { runScriptInNewTerminal } from '@/lib/runScript'

// One "Run Script: <title>" per script, the current project's scripts first.
export function scriptCommands(): Command[] {
  if (!useScriptsSettingsStore.getState().enabled) return []
  const { scripts, tags } = useScriptsStore.getState()
  const { tagged, others } = orderScriptsForProject(scripts, tags, useFileStore.getState().projectRoot)
  return [...tagged, ...others].map((script) => ({
    id: `run-script-${script.id}`,
    label: `Run Script: ${scriptDisplayTitle(script)}`,
    description: script.description,
    keywords: ['script', 'run', 'routine'],
    action: () => { runScriptInNewTerminal(script) },
  }))
}
