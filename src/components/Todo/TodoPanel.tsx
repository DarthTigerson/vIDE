import { useEffect, useMemo, useState } from 'react'
import { useTodoStore } from '@/stores/todoStore'
import { useEditorStore } from '@/stores/editorStore'
import { useTodoSettingsStore } from '@/stores/todoSettingsStore'
import { buildTodoBoardPath, TODO_TRASH_TAB_PATH } from '@/components/Settings/paths'
import { NewTodoProjectModal } from './NewTodoProjectModal'
import { RenameTodoProjectModal } from './RenameTodoProjectModal'
import { TrashTodoProjectModal } from './TrashTodoProjectModal'
import { TodoProjectMenu } from './TodoContextMenu'
import { pillButtonClass } from '@/components/ui/pillButton'
import { sortTodoProjects } from '@/lib/todoProjectSort'
import { TODO_COLUMNS, groupTodosByStatus } from '@/lib/todoBoard'
import type { TodoProject } from '@/types/api'

export function TodoPanel() {
  const projects = useTodoStore((s) => s.projects)
  const todosByProject = useTodoStore((s) => s.todosByProject)
  const loadTodos = useTodoStore((s) => s.loadTodos)
  const projectSort = useTodoSettingsStore((s) => s.projectSort)
  const setProjectSort = useTodoSettingsStore((s) => s.setProjectSort)
  const shownCounts = useTodoSettingsStore((s) => s.shownCounts)
  const toggleShownCount = useTodoSettingsStore((s) => s.toggleShownCount)
  const shownColumns = useMemo(() => TODO_COLUMNS.filter((c) => shownCounts.includes(c.status)), [shownCounts])
  const sortedProjects = useMemo(
    () => sortTodoProjects(projects, projectSort, todosByProject),
    [projects, projectSort, todosByProject],
  )
  // Keys are monospace, so sizing the key column to the longest key in `ch`
  // lines every project name up at the same x.
  const keyColumnWidth = `${Math.max(0, ...projects.map((p) => p.key.length))}ch`
  const statusCounts = useMemo(
    () =>
      new Map(
        projects.map((p) => {
          const groups = groupTodosByStatus(todosByProject[p.id] ?? [])
          return [p.id, shownColumns.map((c) => groups[c.status].length)]
        })
      ),
    [projects, todosByProject, shownColumns],
  )
  // Same trick for the counts: each status column is as wide as its widest
  // number, so the separators line up down the list.
  const countColumnWidths = shownColumns.map(
    (_, i) => `${Math.max(1, ...[...statusCounts.values()].map((counts) => String(counts[i]).length))}ch`
  )
  const loadProjects = useTodoStore((s) => s.loadProjects)
  const lastOpenedProjectId = useTodoStore((s) => s.lastOpenedProjectId)
  const setLastOpenedProject = useTodoStore((s) => s.setLastOpenedProject)
  const openTab = useEditorStore((s) => s.openTab)
  const [modalOpen, setModalOpen] = useState(false)
  const [menu, setMenu] = useState<{ x: number; y: number; project: TodoProject | null } | null>(null)
  const [renameTarget, setRenameTarget] = useState<TodoProject | null>(null)
  const [trashTarget, setTrashTarget] = useState<TodoProject | null>(null)

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  // The per-status counts (and the count sorts) need every project's todos,
  // not just boards opened so far — load the missing ones (once each;
  // refreshAll keeps them fresh).
  useEffect(() => {
    for (const project of projects) {
      if (!useTodoStore.getState().todosByProject[project.id]) loadTodos(project.id)
    }
  }, [projects, loadTodos])

  // Re-focus whatever project's board tab was last active — TodoPanel is
  // unmounted whenever the sidebar switches to a different activity-bar
  // section, so without this, returning to the Todo panel loses your place.
  useEffect(() => {
    if (lastOpenedProjectId) {
      openTab({ path: buildTodoBoardPath(lastOpenedProjectId), content: '', dirty: false })
    }
    // Only on mount — subsequent project switches happen via openProject.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function openProjectMenu(e: React.MouseEvent, project: TodoProject | null) {
    e.preventDefault()
    e.stopPropagation()
    setMenu({ x: e.clientX, y: e.clientY, project })
  }

  function openProject(project: TodoProject) {
    setLastOpenedProject(project.id)
    const tab = { path: buildTodoBoardPath(project.id), content: '', dirty: false }
    openTab(tab)
  }

  return (
    <div className="h-full flex flex-col bg-sidebar border-r border-border overflow-hidden">
      <div className="h-9 px-3 border-b border-border shrink-0 flex items-center justify-between">
        <span className="text-xs font-semibold text-fg-muted uppercase tracking-wider">To Do</span>
        <button
          type="button"
          aria-label="New Project"
          onClick={() => setModalOpen(true)}
          className="w-5 h-5 rounded-sm flex items-center justify-center text-fg-muted hover:text-fg hover:bg-white/10"
        >
          +
        </button>
      </div>

      <div className="flex-1 overflow-y-auto" onContextMenu={(e) => openProjectMenu(e, null)}>
        {projects.length === 0 ? (
          <p className="p-3 text-sm text-fg-subtle">No projects yet.</p>
        ) : (
          sortedProjects.map((project) => (
            <button
              key={project.id}
              type="button"
              aria-pressed={project.id === lastOpenedProjectId}
              onClick={() => openProject(project)}
              onContextMenu={(e) => openProjectMenu(e, project)}
              className={[
                'w-full text-left px-3 py-2 flex items-center gap-2 border-l-2',
                project.id === lastOpenedProjectId
                  ? 'bg-white/5 border-accent'
                  : 'border-transparent hover:bg-white/5',
              ].join(' ')}
            >
              <span className="text-xs font-mono text-fg-subtle shrink-0" style={{ width: keyColumnWidth }}>
                {project.key}
              </span>
              <span className="text-sm text-fg truncate">{project.name}</span>
              {shownColumns.length > 0 && (
                <span
                  aria-label={shownColumns.map((c, i) => `${c.title} ${statusCounts.get(project.id)![i]}`).join(', ')}
                  className="ml-auto shrink-0 text-xs font-mono text-fg-subtle"
                >
                  {statusCounts.get(project.id)!.map((count, i) => (
                    <span key={shownColumns[i].status}>
                      {i > 0 && <span className="px-1 opacity-50">|</span>}
                      <span className="inline-block text-right" style={{ width: countColumnWidths[i] }}>
                        {count}
                      </span>
                    </span>
                  ))}
                </span>
              )}
            </button>
          ))
        )}
      </div>

      <div className="p-2 border-t border-border shrink-0">
        <button
          type="button"
          onClick={() => openTab({ path: TODO_TRASH_TAB_PATH, content: '', dirty: false })}
          className={`${pillButtonClass} gap-1.5`}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
            <path
              d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Trash
        </button>
      </div>

      {modalOpen && <NewTodoProjectModal onClose={() => setModalOpen(false)} />}

      {menu && (
        <TodoProjectMenu
          x={menu.x}
          y={menu.y}
          projectSort={projectSort}
          shownCounts={shownCounts}
          onToggleShownCount={toggleShownCount}
          onClose={() => setMenu(null)}
          onSortProjects={setProjectSort}
          onRename={menu.project ? () => setRenameTarget(menu.project) : undefined}
          onDelete={menu.project ? () => setTrashTarget(menu.project) : undefined}
        />
      )}

      {renameTarget && (
        <RenameTodoProjectModal project={renameTarget} onClose={() => setRenameTarget(null)} />
      )}

      {trashTarget && (
        <TrashTodoProjectModal project={trashTarget} onClose={() => setTrashTarget(null)} />
      )}
    </div>
  )
}
