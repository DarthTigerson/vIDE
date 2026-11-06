import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useEditorStore } from '@/stores/editorStore'
import { useFileStore } from '@/stores/fileStore'
import { GraphView, computeViewBox } from '../GraphView'
import { computeGraphLayout } from '../graphLayout'
import type { GraphifyGraph } from '@/types/graphify'

// Fixed 300x300 rect for every SVG in these tests — handleWheel/handlePointerMove
// divide by rect.width/height to convert screen pixels to viewBox units, and
// jsdom's real getBoundingClientRect() always reports all-zero, which would
// turn those into NaN/Infinity.
function stubSvgRect() {
  return vi.spyOn(SVGElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, left: 0, top: 0, width: 300, height: 300, right: 300, bottom: 300, toJSON: () => {},
  } as DOMRect)
}

const openTabMock = vi.fn()

vi.mock('@/stores/editorStore', () => ({
  useEditorStore: vi.fn(),
}))
vi.mock('@/stores/fileStore', () => ({
  useFileStore: vi.fn(),
}))

const graph: GraphifyGraph = {
  directed: false,
  multigraph: false,
  hyperedges: [],
  nodes: [
    { id: 'src_main', label: 'main.py', file_type: 'code', source_file: 'src/main.py', source_location: 'L1', _origin: 'ast', community: 0 },
    { id: 'src_math_utils', label: 'math_utils.py', file_type: 'code', source_file: 'src/math_utils.py', source_location: 'L1', _origin: 'ast', community: 0 },
  ],
  links: [
    { source: 'src_main', target: 'src_math_utils', relation: 'imports_from', context: 'import', confidence: 'EXTRACTED', confidence_score: 1, source_file: 'src/main.py', source_location: 'L1', weight: 1, _origin: 'ast' },
  ],
}

describe('GraphView', () => {
  beforeEach(() => {
    openTabMock.mockClear()
    Object.defineProperty(window, 'api', {
      value: { readFile: vi.fn().mockResolvedValue('print("hi")') },
      writable: true,
      configurable: true,
    })
    vi.mocked(useEditorStore).mockImplementation((selector?: any) =>
      selector ? selector({ openTab: openTabMock } as any) : undefined
    )
    vi.mocked(useEditorStore).getState = vi.fn(() => ({ openTab: openTabMock, tabs: [], activePaneId: 'pane-1' }))
    vi.mocked(useFileStore).mockImplementation((selector: any) =>
      selector({ projectRoot: '/project' })
    )
  })

  it('renders one labeled node per graph node', () => {
    render(<GraphView graph={graph} />)
    expect(screen.getByText('main.py')).toBeInTheDocument()
    expect(screen.getByText('math_utils.py')).toBeInTheDocument()
  })

  it('clicking a node opens its source file in the editor', async () => {
    render(<GraphView graph={graph} />)
    fireEvent.click(screen.getByText('main.py'))

    await waitFor(() => expect(openTabMock).toHaveBeenCalled())
    expect(window.api.readFile).toHaveBeenCalledWith('/project/src/main.py')
    expect(openTabMock).toHaveBeenCalledWith({ path: '/project/src/main.py', content: 'print("hi")', dirty: false })
  })

  it('clicking a node whose file was moved/deleted does not throw an unhandled rejection', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    ;(window.api.readFile as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('ENOENT: no such file'))

    render(<GraphView graph={graph} />)
    fireEvent.click(screen.getByText('main.py'))

    await waitFor(() => expect(consoleWarnSpy).toHaveBeenCalled())
    expect(openTabMock).not.toHaveBeenCalled()

    consoleWarnSpy.mockRestore()
  })

  it('renders an empty state for a graph with no nodes', () => {
    render(<GraphView graph={{ ...graph, nodes: [], links: [] }} />)
    expect(screen.getByText(/no nodes/i)).toBeInTheDocument()
  })

  it('sets a finite, non-degenerate viewBox with preserveAspectRatio', () => {
    const { container } = render(<GraphView graph={graph} />)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg?.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet')

    const viewBox = svg?.getAttribute('viewBox')
    expect(viewBox).toBeTruthy()
    const [minX, minY, width, height] = viewBox!.split(' ').map(Number)
    expect([minX, minY, width, height].every(Number.isFinite)).toBe(true)
    expect(width).toBeGreaterThan(0)
    expect(height).toBeGreaterThan(0)
  })

  it('computeViewBox bounds every node with padding — the regression check for nodes rendering outside a fixed-size canvas', () => {
    // Real, deterministic node positions (Task 5's layout), not hand-picked
    // coordinates — this is what production code actually feeds computeViewBox.
    const layout = computeGraphLayout(graph.nodes, graph.links, 1200, 900)
    const box = computeViewBox(layout.nodes)

    expect([box.minX, box.minY, box.width, box.height].every(Number.isFinite)).toBe(true)
    expect(box.width).toBeGreaterThan(0)
    expect(box.height).toBeGreaterThan(0)
    for (const node of layout.nodes) {
      expect(node.x).toBeGreaterThanOrEqual(box.minX)
      expect(node.x).toBeLessThanOrEqual(box.minX + box.width)
      expect(node.y).toBeGreaterThanOrEqual(box.minY)
      expect(node.y).toBeLessThanOrEqual(box.minY + box.height)
    }
  })

  it('starts zoomed in rather than fit-to-screen: the initial rendered viewBox is no larger than the full extent', () => {
    const layout = computeGraphLayout(graph.nodes, graph.links, 1200, 900)
    const fullBox = computeViewBox(layout.nodes)

    const { container } = render(<GraphView graph={graph} />)
    const svg = container.querySelector('svg')
    const [, , width, height] = svg!.getAttribute('viewBox')!.split(' ').map(Number)

    expect(width).toBeLessThanOrEqual(fullBox.width)
    expect(height).toBeLessThanOrEqual(fullBox.height)
  })

  it('wheel-down (scroll away from the user) zooms out, growing the viewBox', () => {
    const restoreRect = stubSvgRect()
    const { container } = render(<GraphView graph={graph} />)
    const svg = container.querySelector('svg')!
    const before = svg.getAttribute('viewBox')!.split(' ').map(Number)

    fireEvent.wheel(svg, { deltaY: 100, clientX: 150, clientY: 150 })

    const after = svg.getAttribute('viewBox')!.split(' ').map(Number)
    expect(after[2]).toBeGreaterThan(before[2])
    expect(after[3]).toBeGreaterThan(before[3])
    restoreRect.mockRestore()
  })

  it('wheel-up (scroll toward the user) zooms in, shrinking the viewBox', () => {
    const restoreRect = stubSvgRect()
    const { container } = render(<GraphView graph={graph} />)
    const svg = container.querySelector('svg')!
    const before = svg.getAttribute('viewBox')!.split(' ').map(Number)

    fireEvent.wheel(svg, { deltaY: -100, clientX: 150, clientY: 150 })

    const after = svg.getAttribute('viewBox')!.split(' ').map(Number)
    expect(after[2]).toBeLessThan(before[2])
    expect(after[3]).toBeLessThan(before[3])
    restoreRect.mockRestore()
  })

  it('dragging pans the viewBox (changes position, not size)', () => {
    const restoreRect = stubSvgRect()
    const { container } = render(<GraphView graph={graph} />)
    const svg = container.querySelector('svg')!
    const before = svg.getAttribute('viewBox')!.split(' ').map(Number)

    fireEvent.pointerDown(svg, { clientX: 150, clientY: 150, pointerId: 1 })
    fireEvent.pointerMove(svg, { clientX: 100, clientY: 130, pointerId: 1 })
    fireEvent.pointerUp(svg, { clientX: 100, clientY: 130, pointerId: 1 })

    const after = svg.getAttribute('viewBox')!.split(' ').map(Number)
    expect(after[0]).not.toBeCloseTo(before[0])
    expect(after[1]).not.toBeCloseTo(before[1])
    expect(after[2]).toBeCloseTo(before[2])
    expect(after[3]).toBeCloseTo(before[3])
    restoreRect.mockRestore()
  })

  it('a real drag (past the click threshold) suppresses the node click it ends on', async () => {
    const restoreRect = stubSvgRect()
    render(<GraphView graph={graph} />)
    const node = screen.getByText('main.py').closest('g')!

    fireEvent.pointerDown(node, { clientX: 150, clientY: 150, pointerId: 1 })
    fireEvent.pointerMove(node, { clientX: 150, clientY: 150, pointerId: 1 })
    fireEvent.pointerMove(node, { clientX: 200, clientY: 190, pointerId: 1 })
    fireEvent.pointerUp(node, { clientX: 200, clientY: 190, pointerId: 1 })
    fireEvent.click(node)

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(window.api.readFile).not.toHaveBeenCalled()
    expect(openTabMock).not.toHaveBeenCalled()
    restoreRect.mockRestore()
  })

  it('gives a single-node graph a non-degenerate (non-zero-size) viewBox', () => {
    const singleNodeGraph = {
      ...graph,
      nodes: [graph.nodes[0]],
      links: [],
    }
    const { container } = render(<GraphView graph={singleNodeGraph} />)
    const svg = container.querySelector('svg')
    const viewBox = svg?.getAttribute('viewBox')
    expect(viewBox).toBeTruthy()
    const [, , width, height] = viewBox!.split(' ').map(Number)
    expect(width).toBeGreaterThan(0)
    expect(height).toBeGreaterThan(0)
  })
})
