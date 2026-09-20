// Directory names skipped by every project-wide file walk/search.
export const IGNORED_SEGMENTS = new Set([
  'node_modules', '.git', 'dist', 'out', '.next', 'build',
  'coverage', '.cache', '__pycache__', '.turbo', '.vite',
])
