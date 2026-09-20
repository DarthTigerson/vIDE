import { create } from 'zustand'

// vIDE's own memory of its last Copy/Cut. The OS clipboard is the source of
// truth for *what* to paste; this only remembers that a vIDE Cut is pending,
// because macOS has no OS-level cut to carry that.
interface FileClipboardState {
  paths: string[]
  mode: 'copy' | 'cut' | null
  set: (paths: string[], mode: 'copy' | 'cut') => void
  clear: () => void
}

export const useFileClipboardStore = create<FileClipboardState>((set) => ({
  paths: [],
  mode: null,
  set: (paths, mode) => set({ paths, mode }),
  clear: () => set({ paths: [], mode: null }),
}))
