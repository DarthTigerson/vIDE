import { useEffect, useState } from 'react'
import { useTodoStore } from '@/stores/todoStore'
import { useEditorStore } from '@/stores/editorStore'
import { buildTodoBoardPath } from '@/components/Settings/paths'
import { NewTodoProjectModal } from './NewTodoProjectModal'
import type { TodoProject } from '@/types/api'

export function TodoPanel() {
  const projects = useTodoStore((s) => s.projects)
  const loadProjects = useTodoStore((s) => s.loadProjects)
  const lastOpenedProjectId = useTodoStore((s) => s.lastOpenedProjectId)
  const setLastOpenedProject = useTodoStore((s) => s.setLastOpenedProject)
  const openTab = useEditorStore((s) => s.openTab)
  const [modalOpen, setModalOpen] = useState(false)

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

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

  function openProject(project: TodoProject) {
    setLastOpenedProject(project.id)
    openTab({ path: buildTodoBoardPath(project.id), content: '', dirty: false })
  }

  return (
    <div className="h-full flex flex-col bg-sidebar border-r border-border overflow-hidden">
      <div className="h-9 px-3 border-b border-border shrink-0 flex items-center justify-between">
        <span className="text-xs font-semibold text-fg-muted uppercase tracking-wider">To Do</span>
        <button
          type="button"
          aria-label="New Project"
          onClick={() => setModalOpen(true)}
          className="w-5 h-5 rounded flex items-center justify-center text-fg-muted hover:text-fg hover:bg-white/10"
        >
          +
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {projects.length === 0 ? (
          <p className="p-3 text-sm text-fg-subtle">No projects yet.</p>
        ) : (
          projects.map((project) => (
            <button
              key={project.id}
              type="button"
              aria-pressed={project.id === lastOpenedProjectId}
              onClick={() => openProject(project)}
              className={[
                'w-full text-left px-3 py-2 flex items-center gap-2 border-l-2',
                project.id === lastOpenedProjectId
                  ? 'bg-white/5 border-accent'
                  : 'border-transparent hover:bg-white/5',
              ].join(' ')}
            >
              <span className="text-xs font-mono text-fg-subtle shrink-0">{project.key}</span>
              <span className="text-sm text-fg truncate">{project.name}</span>
            </button>
          ))
        )}
      </div>

      {modalOpen && <NewTodoProjectModal onClose={() => setModalOpen(false)} />}
    </div>
  )
}
