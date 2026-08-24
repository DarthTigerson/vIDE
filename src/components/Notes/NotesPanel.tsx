import { useEffect, useState } from 'react'
import { useNotesStore } from '@/stores/notesStore'
import { useEditorStore } from '@/stores/editorStore'
import { buildNotesBoardPath } from '@/components/Settings/paths'
import { NewNotebookModal } from './NewNotebookModal'
import type { NotesProject } from '@/types/api'

export function NotesPanel() {
  const projects = useNotesStore((s) => s.projects)
  const loadProjects = useNotesStore((s) => s.loadProjects)
  const openTab = useEditorStore((s) => s.openTab)
  const [modalOpen, setModalOpen] = useState(false)

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  function openProject(project: NotesProject) {
    openTab({ path: buildNotesBoardPath(project.id), content: '', dirty: false })
  }

  return (
    <div className="h-full flex flex-col bg-sidebar border-r border-border overflow-hidden">
      <div className="h-9 px-3 border-b border-border shrink-0 flex items-center justify-between">
        <span className="text-xs font-semibold text-fg-muted uppercase tracking-wider">Notes</span>
        <button
          type="button"
          aria-label="New Notebook"
          onClick={() => setModalOpen(true)}
          className="w-5 h-5 rounded flex items-center justify-center text-fg-muted hover:text-fg hover:bg-white/10"
        >
          +
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {projects.length === 0 ? (
          <p className="p-3 text-sm text-fg-subtle">No notebooks yet.</p>
        ) : (
          projects.map((project) => (
            <button
              key={project.id}
              type="button"
              onClick={() => openProject(project)}
              className="w-full text-left px-3 py-2 hover:bg-white/5 flex items-center gap-2"
            >
              <span className="text-sm text-fg truncate">{project.name}</span>
            </button>
          ))
        )}
      </div>

      {modalOpen && <NewNotebookModal onClose={() => setModalOpen(false)} />}
    </div>
  )
}
