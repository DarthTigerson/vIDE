import type { TodoAuthor } from '@/types/api'

export const TODO_AUTHOR_META: Record<TodoAuthor, { text: string; className: string }> = {
  developer: { text: 'Developer', className: 'bg-white/5 text-fg-subtle border-border' },
  claude: { text: 'Claude', className: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
}
