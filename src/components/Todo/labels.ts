import type { TodoLabel } from '@/types/api'

export const TODO_LABELS: TodoLabel[] = ['bug', 'feature', 'nice-to-have']

export const TODO_LABEL_META: Record<TodoLabel, { text: string; className: string; barClassName: string }> = {
  bug: { text: 'Bug', className: 'bg-red-500/15 text-red-400 border-red-500/30', barClassName: 'bg-red-500' },
  feature: {
    text: 'Feature',
    className: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    barClassName: 'bg-blue-500',
  },
  'nice-to-have': {
    text: 'Nice to have',
    className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    barClassName: 'bg-emerald-500',
  },
}
