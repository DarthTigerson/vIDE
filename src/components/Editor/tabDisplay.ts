const MAX_LABEL_LENGTH = 15

export function truncateTabLabel(name: string, maxLength: number = MAX_LABEL_LENGTH): string {
  if (name.length <= maxLength) return name
  return `${name.slice(0, maxLength)}…`
}

// Pinned tabs render leftmost, as a stable group in their own relative
// order, followed by the rest in theirs - the underlying pane tab list
// itself is never reordered, this is purely a display-time projection.
export function orderTabsForDisplay(paths: string[], pinnedPaths: ReadonlySet<string>): string[] {
  const pinned = paths.filter((p) => pinnedPaths.has(p))
  const rest = paths.filter((p) => !pinnedPaths.has(p))
  return [...pinned, ...rest]
}

// Below this average width per tab there is no room for a readable name, so
// inactive tabs collapse to just their icon (like a browser's favicon-only
// tabs) and the active tab keeps its name and close button.
export const COMPACT_TAB_WIDTH = 88

export function isCompactTabStrip(stripWidth: number, tabCount: number): boolean {
  return stripWidth > 0 && tabCount > 0 && stripWidth / tabCount < COMPACT_TAB_WIDTH
}
