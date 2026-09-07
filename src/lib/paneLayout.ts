// Finds the editor split-pane with the most on-screen area, by measuring
// the DOM directly (each pane's root element carries data-pane-id) rather
// than tracking percentages through the EditorLayoutNode split tree — the
// tree only encodes relative splits, and doing the math through arbitrarily
// nested horizontal/vertical splits to get an absolute rendered size is far
// more error-prone than just asking the browser.
export function getBiggestPaneId(): string | null {
  const panes = document.querySelectorAll<HTMLElement>('[data-pane-id]')
  let bestId: string | null = null
  let bestArea = -1
  panes.forEach((el) => {
    const rect = el.getBoundingClientRect()
    const area = rect.width * rect.height
    if (area > bestArea) {
      bestArea = area
      bestId = el.dataset.paneId ?? null
    }
  })
  return bestId
}
