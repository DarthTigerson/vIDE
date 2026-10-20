import type { FileNode } from '@/types/index'

// Folders/files that tools drop into a project. `gitignore` is false where
// ignoring makes no sense: git's own data, or config that's normally
// committed and shared (Claude Code skills/CLAUDE.md, Cursor rules).
export interface HiddenFolderPreset {
  name: string
  description: string
  isDirectory: boolean
  gitignore: boolean
}

export const HIDDEN_FOLDER_PRESETS: HiddenFolderPreset[] = [
  { name: '.git', description: "Git's repository data", isDirectory: true, gitignore: false },
  { name: '.claude', description: 'Claude Code project config (skills, settings). Usually committed.', isDirectory: true, gitignore: false },
  { name: '.cursor', description: 'Cursor project rules. Usually committed.', isDirectory: true, gitignore: false },
  { name: '.vscode', description: 'VS Code workspace settings', isDirectory: true, gitignore: true },
  { name: '.idea', description: 'JetBrains IDE settings', isDirectory: true, gitignore: true },
  { name: 'node_modules', description: 'Installed npm packages', isDirectory: true, gitignore: true },
  { name: '.venv', description: 'Python virtual environment', isDirectory: true, gitignore: true },
  { name: '__pycache__', description: 'Python bytecode cache', isDirectory: true, gitignore: true },
  { name: '.pytest_cache', description: 'pytest cache', isDirectory: true, gitignore: true },
  { name: '.DS_Store', description: 'macOS Finder metadata', isDirectory: false, gitignore: true },
]

// What gets written to / checked against .gitignore: `name/` for a folder so
// a same-named file isn't caught, plain `name` otherwise (which matches
// either, so it's what custom entries use).
export function gitignorePattern(name: string, isDirectory: boolean): string {
  return isDirectory ? `${name}/` : name
}

// Applied to every level of the tree: tools like __pycache__ or .DS_Store
// show up in nested folders, not just at the project root.
export function filterHiddenNodes(nodes: FileNode[], hidden: ReadonlySet<string>): FileNode[] {
  if (hidden.size === 0) return nodes
  return nodes.filter((n) => !hidden.has(n.name))
}

// A bare file/folder name: no path separators, nothing git treats as a
// pattern, and not `.` or `..`.
export function isValidHiddenName(name: string): boolean {
  return name.length > 0 && name !== '.' && name !== '..' && !/[\\/*?[\]!#\s]/.test(name)
}
