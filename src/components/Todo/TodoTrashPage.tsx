import { useEffect, useMemo, useState } from 'react'
import { useTodoStore } from '@/stores/todoStore'
import { TodoTrashMenu } from './TodoContextMenu'
import { TODO_COLUMNS, groupTodosByStatus } from '@/lib/todoBoard'
import type { TodoProject } from '@/types/api'

const COUNT_TITLES = [...TODO_COLUMNS.map((c) => c.title), 'Archived']

// Projects moved to the Trash from the To Do sidebar; right-click a row to
// Restore it. Restore-only for now: a hard delete would just be merged back
// in by vIDE Sync (its merge is additive), so permanent deletion needs a
// synced tombstone first.
export function TodoTrashPage() {
  const trashedProjects = useTodoStore((s) => s.trashedProjects)
  const todosByProject = useTodoStore((s) => s.todosByProject)
  const loadProjects = useTodoStore((s) => s.loadProjects)
  const loadTodos = useTodoStore((s) => s.loadTodos)
  const restoreProject = useTodoStore((s) => s.restoreProject)
  const [error, setError] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; project: TodoProject } | null>(null)

  // Most recently trashed first.
  const sorted = useMemo(
    () => [...trashedProjects].sort((a, b) => (b.trashedAt ?? 0) - (a.trashedAt ?? 0)),
    [trashedProjects],
  )

  // backlog | todo | in progress | done | archived, per project — null until
  // that project's todos have loaded.
  const counts = useMemo(
    () =>
      new Map(
        trashedProjects.map((p) => {
          const todos = todosByProject[p.id]
          if (!todos) return [p.id, null]
          const groups = groupTodosByStatus(todos)
          return [p.id, [...TODO_COLUMNS.map((c) => groups[c.status].length), todos.filter((t) => t.archived).length]]
        })
      ),
    [trashedProjects, todosByProject],
  )
  // Each count column is as wide as its widest number so the separators
  // line up down the list (same as the sidebar's counts).
  const countWidths = COUNT_TITLES.map(
    (_, i) =>
      `${Math.max(1, ...[...counts.values()].map((row) => (row ? String(row[i]).length : 1)))}ch`
  )

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  useEffect(() => {
    for (const project of trashedProjects) {
      if (!useTodoStore.getState().todosByProject[project.id]) loadTodos(project.id)
    }
  }, [trashedProjects, loadTodos])

  async function restore(id: string) {
    setError(null)
    try {
      await restoreProject(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to restore project')
    }
  }

  return (
    <div className="h-full flex flex-col bg-panel overflow-hidden">
      <div className="h-11 px-4 border-b border-border shrink-0 flex items-center">
        <h1 className="text-sm font-semibold text-fg">Trash</h1>
      </div>
      {error && <p className="px-4 pt-3 text-xs text-red-400">{error}</p>}
      {sorted.length === 0 ? (
        <p className="p-4 text-sm text-fg-subtle">The Trash is empty.</p>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {sorted.map((project) => {
            const row = counts.get(project.id)
            return (
              <div
                key={project.id}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setMenu({ x: e.clientX, y: e.clientY, project })
                }}
                className="flex items-center gap-3 px-4 py-2 border-b border-border/60 hover:bg-white/5"
              >
                <span className="text-xs font-mono text-fg-subtle shrink-0">{project.key}</span>
                <span className="flex-1 text-sm text-fg truncate">{project.name}</span>
                {row && (
                  <span className="mr-5 text-xs font-mono text-fg-subtle shrink-0">
                    {row.map((count, i) => (
                      <span key={COUNT_TITLES[i]}>
                        {i > 0 && <span className="px-1 opacity-50">|</span>}
                        {/* Name-only hover label in the activity-bar tooltip style. */}
                        <span
                          className="group relative inline-block text-right hover:text-fg"
                          style={{ width: countWidths[i] }}
                        >
                          {count}
                          <span
                            role="tooltip"
                            className="pointer-events-none absolute left-1/2 top-full z-50 mt-1 -translate-x-1/2 whitespace-nowrap rounded-sm bg-black/90 px-2 py-1 font-sans text-xs text-gray-200 opacity-0 transition-opacity duration-100 delay-150 group-hover:opacity-100"
                          >
                            {COUNT_TITLES[i]}
                          </span>
                        </span>
                      </span>
                    ))}
                  </span>
                )}
                {project.trashedAt && (
                  <span className="text-xs text-fg-subtle shrink-0">
                    Trashed {new Date(project.trashedAt).toLocaleDateString()}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
      {menu && (
        <TodoTrashMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          onRestore={() => restore(menu.project.id)}
        />
      )}
    </div>
  )
}
