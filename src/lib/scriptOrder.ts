import { scriptDisplayTitle } from './scriptBody'

// Scripts run in the current project before (tagged), the rest after; both
// groups alphabetical. Every script list (panel, terminal menus, palette)
// uses this so they agree.
export function orderScriptsForProject<T extends { id: string; title: string }>(
  scripts: T[],
  tags: Record<string, string[]>,
  projectRoot: string | null,
): { tagged: T[]; others: T[] } {
  const byTitle = (a: T, b: T) =>
    scriptDisplayTitle(a).localeCompare(scriptDisplayTitle(b), undefined, { sensitivity: 'base' })
  const isTagged = (s: T) => !!projectRoot && (tags[s.id] ?? []).includes(projectRoot)
  return {
    tagged: scripts.filter(isTagged).sort(byTitle),
    others: scripts.filter((s) => !isTagged(s)).sort(byTitle),
  }
}
