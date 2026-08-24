/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { PaneDropZoneOverlay } from '../PaneDropZoneOverlay'
import { useEditorStore } from '@/stores/editorStore'
import { useTabDragStore } from '@/stores/tabDragStore'

// A 200x100 rect at a nonzero offset - jsdom returns all-zero rects by
// default, so every test that needs real geometry stubs this.
const RECT = { left: 50, top: 20, width: 200, height: 100, right: 250, bottom: 120, x: 50, y: 20, toJSON: () => ({}) }

function stubRect() {
  Element.prototype.getBoundingClientRect = () => RECT as DOMRect
}

function videDataTransfer() {
  return { types: ['text/plain', 'application/x-vide-pane'], dropEffect: 'none' } as unknown as DataTransfer
}

// jsdom doesn't implement DragEvent, so fireEvent.dragOver/.drop silently
// drop clientX/clientY from the init dict - build the event by hand and
// assign the MouseEvent-ish properties directly instead.
function dragEventAt(type: 'dragover' | 'drop', clientX: number, clientY: number): Event {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.assign(event, { clientX, clientY, dataTransfer: videDataTransfer() })
  return event
}

function twoPaneLayout() {
  useEditorStore.setState({
    tabs: [
      { path: '/left.ts', content: '', dirty: false },
      { path: '/right.ts', content: '', dirty: false },
    ],
    activeTabPath: '/left.ts',
    layout: {
      type: 'split',
      direction: 'horizontal',
      children: [
        { type: 'pane', id: 'pane-left' },
        { type: 'pane', id: 'pane-right' },
      ],
    },
    activePaneId: 'pane-left',
    paneTabs: { 'pane-left': '/left.ts', 'pane-right': '/right.ts' },
    paneTabLists: { 'pane-left': ['/left.ts'], 'pane-right': ['/right.ts'] },
    closedTabs: [],
    pinnedPaths: new Set(),
  })
}

beforeEach(() => {
  stubRect()
  useTabDragStore.setState({ dragging: null })
})

afterEach(() => {
  cleanup()
  useTabDragStore.setState({ dragging: null })
})

describe('PaneDropZoneOverlay', () => {
  it('splits the pane (before/horizontal) when dropped on the left edge, moving the tab from its source pane', () => {
    twoPaneLayout()
    useTabDragStore.getState().startDrag('/right.ts', 'pane-right')
    const { container } = render(<PaneDropZoneOverlay paneId="pane-left" />)
    const overlay = container.firstElementChild as HTMLElement

    fireEvent(overlay, dragEventAt('dragover', 50 + 10, 20 + 50))
    fireEvent(overlay, dragEventAt('drop', 50 + 10, 20 + 50))

    const state = useEditorStore.getState()
    expect(state.paneTabLists['pane-left']).toEqual(['/left.ts'])
    expect(state.paneTabLists['pane-right']).toBeUndefined() // collapsed, was its only tab
    expect(state.paneTabLists[state.activePaneId]).toEqual(['/right.ts'])
    expect(state.layout).toEqual({
      type: 'split',
      direction: 'horizontal',
      children: [
        { type: 'pane', id: state.activePaneId },
        { type: 'pane', id: 'pane-left' },
      ],
    })
  })

  it('moves the tab into the pane when dropped in the center, from a different pane', () => {
    twoPaneLayout()
    useTabDragStore.getState().startDrag('/right.ts', 'pane-right')
    const { container } = render(<PaneDropZoneOverlay paneId="pane-left" />)
    const overlay = container.firstElementChild as HTMLElement

    fireEvent(overlay, dragEventAt('dragover', 50 + 100, 20 + 50))
    fireEvent(overlay, dragEventAt('drop', 50 + 100, 20 + 50))

    const state = useEditorStore.getState()
    expect(state.paneTabLists['pane-left']).toEqual(['/left.ts', '/right.ts'])
  })

  it('is a no-op center-drop within the tab\'s own pane (no accidental reorder)', () => {
    twoPaneLayout()
    useTabDragStore.getState().startDrag('/left.ts', 'pane-left')
    const { container } = render(<PaneDropZoneOverlay paneId="pane-left" />)
    const overlay = container.firstElementChild as HTMLElement
    const before = useEditorStore.getState()

    fireEvent(overlay, dragEventAt('dragover', 50 + 100, 20 + 50))
    fireEvent(overlay, dragEventAt('drop', 50 + 100, 20 + 50))

    expect(useEditorStore.getState()).toEqual(before)
  })

  it('clears drag state on drop even if dragend never fires on the (possibly-unmounted) source', () => {
    // Regression test: dropping on a pane's content area (not another tab in
    // the strip) moves/splits the tab, which can remove the drag source's own
    // DOM node before the browser dispatches dragend on it - if handleDrop
    // relied on dragend to clear useTabDragStore, dragging would stay stuck
    // non-null forever, leaving every pane's overlay permanently
    // pointer-events-auto. This drop deliberately never fires dragend.
    twoPaneLayout()
    useTabDragStore.getState().startDrag('/right.ts', 'pane-right')
    const { container } = render(<PaneDropZoneOverlay paneId="pane-left" />)
    const overlay = container.firstElementChild as HTMLElement

    fireEvent(overlay, dragEventAt('dragover', 50 + 100, 20 + 50))
    fireEvent(overlay, dragEventAt('drop', 50 + 100, 20 + 50))

    expect(useTabDragStore.getState().dragging).toBeNull()
  })

  it('renders nothing interactive when no drag is in progress', () => {
    twoPaneLayout()
    const { container } = render(<PaneDropZoneOverlay paneId="pane-left" />)
    const overlay = container.firstElementChild as HTMLElement
    expect(overlay.className).toMatch(/pointer-events-none/)
  })
})
