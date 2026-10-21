import type { TodoAuthor } from '@/types/api'

export const TODO_AUTHOR_META: Record<TodoAuthor, { text: string; className: string }> = {
  developer: { text: 'Developer', className: 'bg-white/5 text-fg-subtle border-border' },
  claude: { text: 'Claude', className: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
  bridge: { text: 'Bridge', className: 'bg-sky-500/15 text-sky-400 border-sky-500/30' },
  llama: { text: 'Llama', className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
}

// An author this build doesn't know (e.g. synced from a newer vIDE) still
// renders, as a neutral badge with its raw name.
export function todoAuthorMeta(author: string): { text: string; className: string } {
  return TODO_AUTHOR_META[author as TodoAuthor] ?? { text: author, className: TODO_AUTHOR_META.developer.className }
}
