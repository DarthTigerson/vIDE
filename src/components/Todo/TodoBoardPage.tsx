import { useEffect, useRef, useState } from 'react'
import { useTodoStore, EMPTY_TODOS } from '@/stores/todoStore'
import { useEditorStore } from '@/stores/editorStore'
import { buildTodoDetailPath } from '@/components/Settings/paths'
import { TODO_COLUMNS, groupTodosByStatus } from '@/lib/todoBoard'
import { TodoCard } from './TodoCard'
import { TodoArchiveList } from './TodoArchiveList'
import type { TodoStatus } from '@/types/api'

function autoGrow(el: HTMLTextAreaElement) {
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

export function TodoBoardPage({ projectId }: { projectId: string }) {
  const project = useTodoStore((s) => s.projects.find((p) => p.id === projectId))
  const todos = useTodoStore((s) => s.todosByProject[projectId] ?? EMPTY_TODOS)
  const loadTodos = useTodoStore((s) => s.loadTodos)
  const createTodo = useTodoStore((s) => s.createTodo)
  const updateTodo = useTodoStore((s) => s.updateTodo)
  const archiveTodo = useTodoStore((s) => s.archiveTodo)
  const openTab = useEditorStore((s) => s.openTab)

  const [view, setView] = useState<'board' | 'archive'>('board')
  const [addingStatus, setAddingStatus] = useState<TodoStatus | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const newTitleInputRef = useRef<HTMLTextAreaElement>(null)

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

  function closeComposer() {
    setAddingStatus(null)
    setNewTitle('')
  }

  async function handleCreate(status: TodoStatus) {
    const title = newTitle.trim()
    if (!title) return
    const todo = await createTodo(projectId, title)
    if (status !== 'backlog') await updateTodo(todo.id, { status })
    setNewTitle('')
    const el = newTitleInputRef.current
    if (el) {
      el.style.height = 'auto'
      el.focus()
    }
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
                {groups[col.status].map((todo) => (
                  <TodoCard key={todo.id} todo={todo} onOpen={() => openDetail(todo.id)} />
                ))}
                {addingStatus === col.status ? (
                  <div className="rounded border border-accent/60 bg-sidebar p-2">
                    <textarea
                      ref={newTitleInputRef}
                      autoFocus
                      rows={1}
                      value={newTitle}
                      onChange={(e) => {
                        setNewTitle(e.target.value)
                        autoGrow(e.target)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleCreate(col.status)
                        } else if (e.key === 'Escape') {
                          closeComposer()
                        }
                      }}
                      onBlur={closeComposer}
                      placeholder="What needs to be done?"
                      className="w-full bg-transparent text-sm leading-5 text-fg placeholder:text-fg-subtle resize-none outline-none max-h-10 overflow-y-auto"
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAddingStatus(col.status)}
                    className="text-left text-xs text-fg-subtle hover:text-fg-muted px-1 py-1"
                  >
                    + Add issue
                  </button>
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
    </div>
  )
}
