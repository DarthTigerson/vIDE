import { useEffect, useRef, useState } from 'react'
import { useTodoStore, EMPTY_TODOS } from '@/stores/todoStore'
import { useEditorStore } from '@/stores/editorStore'
import { buildTodoDetailPath } from '@/components/Settings/paths'
import { TODO_COLUMNS, groupTodosByStatus, sortTodos } from '@/lib/todoBoard'
import type { TodoSortDirection, TodoSortMode } from '@/lib/todoBoard'
import { ArchiveIcon } from './ArchiveIcon'
import { BoardIcon } from './BoardIcon'
import { TodoCard } from './TodoCard'
import { TodoArchiveList } from './TodoArchiveList'
import { TodoCardMenu, TodoSortMenu } from './TodoContextMenu'
import type { Todo, TodoStatus } from '@/types/api'

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
  const reorderTodo = useTodoStore((s) => s.reorderTodo)
  const archiveTodo = useTodoStore((s) => s.archiveTodo)
  const view = useTodoStore((s) => s.boardViewByProject[projectId] ?? 'board')
  const setView = useTodoStore((s) => s.setBoardView)
  const openTab = useEditorStore((s) => s.openTab)

  const [addingStatus, setAddingStatus] = useState<TodoStatus | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const newTitleInputRef = useRef<HTMLTextAreaElement>(null)
  const [sortModes, setSortModes] = useState<Record<TodoStatus, TodoSortMode>>({
    backlog: 'manual',
    todo: 'manual',
    in_progress: 'manual',
    done: 'manual',
  })
  const [sortDirections, setSortDirections] = useState<Record<TodoStatus, TodoSortDirection>>({
    backlog: 'asc',
    todo: 'asc',
    in_progress: 'asc',
    done: 'asc',
  })
  type BoardMenu =
    | { type: 'card'; x: number; y: number; todo: Todo }
    | { type: 'sort'; x: number; y: number; status: TodoStatus }
  const [menu, setMenu] = useState<BoardMenu | null>(null)

  useEffect(() => {
    loadTodos(projectId)
  }, [projectId, loadTodos])

  const groups = groupTodosByStatus(todos)
  const archived = todos.filter((t) => t.archived)

  function openDetail(todoId: string) {
    openTab({ path: buildTodoDetailPath(projectId, todoId), content: '', dirty: false })
  }

  function handleColumnDrop(e: React.DragEvent, status: TodoStatus) {
    e.preventDefault()
    const draggedId = e.dataTransfer.getData('text/plain')
    if (draggedId) reorderTodo(projectId, draggedId, status, null)
  }

  function handleCardDrop(
    status: TodoStatus,
    targetId: string,
    placement: 'before' | 'after',
    draggedId: string
  ) {
    const list = groups[status]
    const targetIndex = list.findIndex((t) => t.id === targetId)
    const beforeId = placement === 'before' ? targetId : (list[targetIndex + 1]?.id ?? null)
    reorderTodo(projectId, draggedId, status, beforeId)
  }

  function closeComposer() {
    setAddingStatus(null)
    setNewTitle('')
  }

  function openCardMenu(e: React.MouseEvent, todo: Todo) {
    setMenu({ type: 'card', x: e.clientX, y: e.clientY, todo })
  }

  function openSortMenu(e: React.MouseEvent, status: TodoStatus) {
    e.preventDefault()
    setMenu({ type: 'sort', x: e.clientX, y: e.clientY, status })
  }

  async function duplicateTodo(todo: Todo) {
    const copy = await createTodo(projectId, `${todo.title} (copy)`)
    await updateTodo(copy.id, {
      description: todo.description,
      status: todo.status,
      label: todo.label,
      tags: todo.tags,
    })
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
        <div className="relative flex bg-white/5 rounded-md p-0.5">
          <div
            className={`absolute inset-y-0.5 w-7 rounded bg-white/10 transition-transform ${view === 'archive' ? 'translate-x-7' : 'translate-x-0'}`}
          />
          <button
            type="button"
            aria-pressed={view === 'board'}
            aria-label="Board"
            title="Board"
            onClick={() => setView(projectId, 'board')}
            className={`relative w-7 h-6 flex items-center justify-center rounded ${view === 'board' ? 'text-fg' : 'text-fg-muted'}`}
          >
            <BoardIcon />
          </button>
          <button
            type="button"
            aria-pressed={view === 'archive'}
            aria-label="Archive"
            title="Archive"
            onClick={() => setView(projectId, 'archive')}
            className={`relative w-7 h-6 flex items-center justify-center rounded ${view === 'archive' ? 'text-fg' : 'text-fg-muted'}`}
          >
            <ArchiveIcon />
          </button>
        </div>
      </div>

      {view === 'board' ? (
        <div className="flex-1 min-h-0 overflow-x-auto flex divide-x divide-border">
          {TODO_COLUMNS.map((col) => (
            <div
              key={col.status}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleColumnDrop(e, col.status)}
              onContextMenu={(e) => openSortMenu(e, col.status)}
              className="flex-1 min-w-[240px] min-h-0 flex flex-col bg-sidebar/30"
            >
              <div className="px-3 py-2 flex items-center justify-between shrink-0 border-b border-border/60">
                <h2 className="text-xs font-semibold text-fg-muted uppercase tracking-wider">
                  {col.title}
                </h2>
                <span className="text-[0.65rem] leading-none px-1.5 py-1 rounded-full bg-white/5 text-fg-subtle">
                  {groups[col.status].length}
                </span>
              </div>
              <div className="flex-1 min-h-0 flex flex-col gap-2 overflow-y-auto p-3">
                {sortTodos(groups[col.status], sortModes[col.status], sortDirections[col.status]).map((todo) => (
                  <TodoCard
                    key={todo.id}
                    todo={todo}
                    onOpen={() => openDetail(todo.id)}
                    onDropOn={(draggedId, placement) =>
                      handleCardDrop(col.status, todo.id, placement, draggedId)
                    }
                    onContextMenu={(e) => openCardMenu(e, todo)}
                  />
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

      {menu?.type === 'card' && (
        <TodoCardMenu
          x={menu.x}
          y={menu.y}
          todo={menu.todo}
          columnSortMode={sortModes[menu.todo.status]}
          columnSortDirection={sortDirections[menu.todo.status]}
          onClose={() => setMenu(null)}
          onDuplicate={() => duplicateTodo(menu.todo)}
          onMoveTo={(status) => updateTodo(menu.todo.id, { status })}
          onArchive={() => archiveTodo(menu.todo.id, true)}
          onSortColumnMode={(mode) =>
            setSortModes((prev) => ({ ...prev, [menu.todo.status]: mode }))
          }
          onSortAllMode={(mode) =>
            setSortModes({ backlog: mode, todo: mode, in_progress: mode, done: mode })
          }
          onSortColumnDirection={(direction) =>
            setSortDirections((prev) => ({ ...prev, [menu.todo.status]: direction }))
          }
          onSortAllDirection={(direction) =>
            setSortDirections({
              backlog: direction,
              todo: direction,
              in_progress: direction,
              done: direction,
            })
          }
        />
      )}

      {menu?.type === 'sort' && (
        <TodoSortMenu
          x={menu.x}
          y={menu.y}
          columnSortMode={sortModes[menu.status]}
          columnSortDirection={sortDirections[menu.status]}
          onClose={() => setMenu(null)}
          onSelectColumnMode={(mode) => setSortModes((prev) => ({ ...prev, [menu.status]: mode }))}
          onSelectAllMode={(mode) =>
            setSortModes({ backlog: mode, todo: mode, in_progress: mode, done: mode })
          }
          onSelectColumnDirection={(direction) =>
            setSortDirections((prev) => ({ ...prev, [menu.status]: direction }))
          }
          onSelectAllDirection={(direction) =>
            setSortDirections({
              backlog: direction,
              todo: direction,
              in_progress: direction,
              done: direction,
            })
          }
        />
      )}
    </div>
  )
}
