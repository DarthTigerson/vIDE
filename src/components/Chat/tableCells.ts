// Claude Code renders markdown tables with box-drawing borders, wrapping a
// long cell value inside its column. The continuation lands on the next row
// between the same two "│" borders, so row-by-row joining (which looks at the
// whole row) never sees one token. These pure helpers split a bordered row
// into cells and decide whether a cell continues onto the row below.

export const TABLE_BORDER = '│'

export interface TableCell {
  // Index range of the raw cell text (between the borders) within the row.
  start: number
  end: number
  // Raw cell text, including its padding spaces.
  raw: string
}

// Returns null unless the row is a content row: starts and ends with "│".
// Separator rows (├───┼───┤, ┌───┐) start with other characters.
export function splitTableRow(rowText: string): TableCell[] | null {
  const text = rowText.trimEnd()
  if (!text.startsWith(TABLE_BORDER) || !text.endsWith(TABLE_BORDER) || text.length < 2) return null
  const cells: TableCell[] = []
  let start = 1
  for (let i = 1; i < text.length; i++) {
    if (text[i] !== TABLE_BORDER) continue
    cells.push({ start, end: i, raw: text.slice(start, i) })
    start = i + 1
  }
  return cells
}

// A cell "runs to the edge" when its text fills the whole column, leaving
// no more trailing space than the left padding. A word-wrapped cell leaves a
// gap at the end, so this only fires for a token cut mid-way (a long path or
// URL), which keeps ordinary wrapped prose from being glued together.
export function cellRunsToEdge(cell: TableCell): boolean {
  if (!cell.raw.trim()) return false
  const leftPad = cell.raw.length - cell.raw.trimStart().length
  const rightPad = cell.raw.length - cell.raw.trimEnd().length
  return rightPad <= leftPad
}

// True when cell `index` of `row` continues in cell `index` of `next`.
export function tableCellContinues(row: TableCell[], next: TableCell[] | null, index: number): boolean {
  if (!next || next.length !== row.length) return false
  return cellRunsToEdge(row[index]) && next[index].raw.trim().length > 0
}
