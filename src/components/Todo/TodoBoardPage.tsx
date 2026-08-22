import { useEffect, useState } from 'react'
import { useTodoStore, EMPTY_TODOS } from '@/stores/todoStore'
import { useEditorStore } from '@/stores/editorStore'
import { buildTodoDetailPath, buildTodoNewPath } from '@/components/Settings/paths'
import { TODO_COLUMNS, groupTodosByStatus } from '@/lib/todoBoard'
import { TodoCard } from './TodoCard'
import { TodoArchiveList } from './TodoArchiveList'
import type { TodoStatus } from '@/types/api'

export function TodoBoardPage({ projectId }: { projectId: string }) {
  const project = useTodoStore((s) => s.projects.find((p) => p.id === projectId))
  const todos = useTodoStore((s) => s.todosByProject[projectId] ?? EMPTY_TODOS)
  const loadTodos = useTodoStore((s) => s.loadTodos)
  const updateTodo = useTodoStore((s) => s.updateTodo)
  const archiveTodo = useTodoStore((s) => s.archiveTodo)
  const openTab = useEditorStore((s) => s.openTab)

  const [view, setView] = useState<'board' | 'archive'>('board')

  useEffect(() => {
    loadTodos(projectId)
  }, [projectId, loadTodos])

  const groups = groupTodosByStatus(todos)
  const archived = todos.filter((t) => t.archived)

  function openDetail(todoId: string) {
    openTab({ path: buildTodoDetailPath(projectId, todoId), content: '', dirty: false })
  }

  function handleDrop(e: React.DragEvent, status: TodoStatus) {
    e.preventDefault()
    const todoId = e.dataTransfer.getData('text/plain')
    if (todoId) updateTodo(todoId, { status })
  }

  return (
    <div className="h-full flex flex-col bg-panel overflow-hidden relative">
      <div className="h-11 px-4 border-b border-border shrink-0 flex items-center justify-between">
        <h1 className="text-sm font-semibold text-fg">{project?.name ?? 'Todo'}</h1>
        <div className="flex gap-1">
          <button
            type="button"
            aria-pressed={view === 'board'}
            onClick={() => setView('board')}
            className={`text-xs px-2 py-1 rounded ${view === 'board' ? 'bg-white/10 text-fg' : 'text-fg-muted'}`}
          >
            Board
          </button>
          <button
            type="button"
            aria-pressed={view === 'archive'}
            onClick={() => setView('archive')}
            className={`text-xs px-2 py-1 rounded ${view === 'archive' ? 'bg-white/10 text-fg' : 'text-fg-muted'}`}
          >
            Archive
          </button>
        </div>
      </div>

      {view === 'board' ? (
        <div className="flex-1 overflow-x-auto flex divide-x divide-border">
          {TODO_COLUMNS.map((col) => (
            <div
              key={col.status}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDrop(e, col.status)}
              className="flex-1 min-w-[240px] flex flex-col bg-sidebar/30"
            >
              <div className="px-3 py-2 flex items-center justify-between shrink-0 border-b border-border/60">
                <h2 className="text-xs font-semibold text-fg-muted uppercase tracking-wider">
                  {col.title}
                </h2>
                <span className="text-[0.65rem] leading-none px-1.5 py-1 rounded-full bg-white/5 text-fg-subtle">
                  {groups[col.status].length}
                </span>
              </div>
              <div className="flex-1 flex flex-col gap-2 overflow-y-auto p-3">
                {groups[col.status].length === 0 ? (
                  <p className="text-xs text-fg-subtle/70 italic">No todos</p>
                ) : (
                  groups[col.status].map((todo) => (
                    <TodoCard key={todo.id} todo={todo} onOpen={() => openDetail(todo.id)} />
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <TodoArchiveList
          todos={archived}
          onOpen={openDetail}
          onUnarchive={(id) => archiveTodo(id, false)}
        />
      )}

      <button
        type="button"
        aria-label="New todo"
        onClick={() => openTab({ path: buildTodoNewPath(projectId), content: '', dirty: false })}
        className="absolute bottom-6 right-6 w-12 h-12 rounded-full bg-accent text-on-accent shadow-lg shadow-black/40 flex items-center justify-center text-2xl leading-none hover:bg-accent/90 active:scale-95 transition-transform"
      >
        +
      </button>
    </div>
  )
}
