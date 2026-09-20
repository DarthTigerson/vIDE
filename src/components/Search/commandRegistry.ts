import { getMonacoCommands } from '@/lib/monacoCommands'
import type { Command } from './commands'
import { pageCommands } from './pageCommands'
import { panelCommands } from './panelCommands'
import { gitCommands } from './gitCommands'

// Each domain owns its own commands and exports a provider; this is the one
// place that lists them. Providers are called on every palette filter pass
// (not once at import) so state-dependent entries — conditions, disabled
// reasons, repo names — are always current.
const PROVIDERS: Array<() => Command[]> = [panelCommands, pageCommands, gitCommands]

export function getAllCommands(): Command[] {
  // Editor commands (Add Cursor Above, Format Document, etc.) come from
  // whichever editor was last focused, so they are merged in fresh each time.
  return [...PROVIDERS.flatMap((provider) => provider()), ...getMonacoCommands()]
}
