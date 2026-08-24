import { create } from 'zustand'
import type { NotesProject } from '@/types/api'

interface NotesStore {
  projects: NotesProject[]
  loadProjects: () => Promise<void>
  createProject: (name: string) => Promise<NotesProject>
  renameProject: (id: string, name: string) => Promise<NotesProject>
  deleteProject: (id: string) => Promise<void>
}

export const useNotesStore = create<NotesStore>((set, get) => ({
  projects: [],

  loadProjects: async () => {
    const projects = await window.api.notesListProjects()
    set({ projects })
  },

  createProject: async (name) => {
    const project = await window.api.notesCreateProject(name)
    set({ projects: [...get().projects, project] })
    return project
  },

  renameProject: async (id, name) => {
    const updated = await window.api.notesRenameProject(id, name)
    set({ projects: get().projects.map((p) => (p.id === id ? updated : p)) })
    return updated
  },

  deleteProject: async (id) => {
    await window.api.notesDeleteProject(id)
    set({ projects: get().projects.filter((p) => p.id !== id) })
  },
}))
