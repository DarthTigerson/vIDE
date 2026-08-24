import type { Todo } from '@/types/api'

export function TodoArchiveList({
  todos,
  onOpen,
  onUnarchive,
}: {
  todos: Todo[]
  onOpen: (id: string) => void
  onUnarchive: (id: string) => void
}) {
  if (todos.length === 0) {
    return <p className="p-4 text-sm text-fg-subtle">No archived todos.</p>
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {todos.map((todo) => (
        <div
          key={todo.id}
          className="flex items-center gap-3 px-4 py-2 border-b border-border/60 hover:bg-white/5"
        >
          <span className="text-xs font-mono text-fg-subtle shrink-0">{todo.id}</span>
          <button
            type="button"
            onClick={() => onOpen(todo.id)}
            className="flex-1 text-left text-sm text-fg truncate"
          >
            {todo.title}
          </button>
          <button
            type="button"
            onClick={() => onUnarchive(todo.id)}
            className="text-xs text-fg-muted hover:text-fg shrink-0"
          >
            Unarchive
          </button>
        </div>
      ))}
    </div>
  )
}
