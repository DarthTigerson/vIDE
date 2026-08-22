import { TODO_LABEL_META } from './labels'
import type { Todo } from '@/types/api'

export function TodoCard({ todo, onOpen }: { todo: Todo; onOpen: () => void }) {
  return (
    <div
      onClick={onOpen}
      draggable
      onDragStart={(e) => e.dataTransfer.setData('text/plain', todo.id)}
      className="rounded border border-border bg-sidebar p-2 flex flex-col gap-1.5 cursor-pointer hover:border-accent/60"
    >
      <span className="text-[0.65rem] font-mono text-fg-subtle">{todo.id}</span>
      <p className="text-sm text-fg">{todo.title}</p>
      {(todo.label || todo.tags.length > 0) && (
        <div className="flex flex-wrap gap-1">
          {todo.label && (
            <span
              className={`text-[0.6rem] px-1.5 py-0.5 rounded border ${TODO_LABEL_META[todo.label].className}`}
            >
              {TODO_LABEL_META[todo.label].text}
            </span>
          )}
          {todo.tags.map((tag) => (
            <span
              key={tag}
              className="text-[0.6rem] px-1.5 py-0.5 rounded border border-border text-fg-subtle"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
