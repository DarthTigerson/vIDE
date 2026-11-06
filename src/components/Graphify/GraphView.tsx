import { openFile } from '@/lib/openFile'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react'
import { computeGraphLayout, type PositionedNode } from './graphLayout'
import { useFileStore } from '@/stores/fileStore'
import { useEditorStore } from '@/stores/editorStore'
import type { GraphifyGraph } from '@/types/graphify'

const WIDTH = 1200
const HEIGHT = 900
const NODE_RADIUS = 7

// Slack added around the tight bounding box of node positions, in px — needs
// to comfortably fit a node's circle plus its label text so nothing at the
// graph's edge gets clipped by the viewBox.
const VIEWBOX_PADDING = 60
// Floor for viewBox width/height so a single-node (or otherwise degenerate,
// zero-extent) graph doesn't collapse into a zero-sized/invalid viewBox.
const MIN_VIEWBOX_SIZE = 200

// Large graphs start zoomed in (showing this fraction of the full extent)
// rather than fit-to-screen — rendering every node at once is what was
// lagging on bigger repos, so the initial view intentionally shows less.
const INITIAL_ZOOM_FRACTION = 0.35
// Zoom clamps, in viewBox width/height units (smaller box = more zoomed in).
const MIN_ZOOM_SIZE = 100
const MAX_ZOOM_OUT_MULTIPLIER = 2.5
const ZOOM_STEP = 0.1
// Screen-pixel drag distance beyond which a pointer gesture counts as a pan
// rather than a click — suppresses accidental file-opens while dragging.
const DRAG_CLICK_THRESHOLD = 4

export interface ViewBox {
  minX: number
  minY: number
  width: number
  height: number
}

export function computeViewBox(nodes: PositionedNode[]): ViewBox {
  if (nodes.length === 0) {
    return { minX: 0, minY: 0, width: MIN_VIEWBOX_SIZE, height: MIN_VIEWBOX_SIZE }
  }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const node of nodes) {
    minX = Math.min(minX, node.x)
    minY = Math.min(minY, node.y)
    maxX = Math.max(maxX, node.x)
    maxY = Math.max(maxY, node.y)
  }

  minX -= VIEWBOX_PADDING
  minY -= VIEWBOX_PADDING
  maxX += VIEWBOX_PADDING
  maxY += VIEWBOX_PADDING

  const rawWidth = maxX - minX
  const rawHeight = maxY - minY
  const width = Math.max(rawWidth, MIN_VIEWBOX_SIZE)
  const height = Math.max(rawHeight, MIN_VIEWBOX_SIZE)
  // If we had to pad up to the minimum size, re-center the box on the
  // original midpoint rather than leaving the extra slack lopsided on one side.
  const centerX = minX + rawWidth / 2
  const centerY = minY + rawHeight / 2

  return {
    minX: centerX - width / 2,
    minY: centerY - height / 2,
    width,
    height,
  }
}

// The initial view: same center as the full-extent box, but zoomed in —
// the user pans/scrolls out from here rather than starting fit-to-screen.
function zoomedInViewBox(full: ViewBox): ViewBox {
  const width = Math.max(full.width * INITIAL_ZOOM_FRACTION, MIN_VIEWBOX_SIZE)
  const height = Math.max(full.height * INITIAL_ZOOM_FRACTION, MIN_VIEWBOX_SIZE)
  const centerX = full.minX + full.width / 2
  const centerY = full.minY + full.height / 2
  return { minX: centerX - width / 2, minY: centerY - height / 2, width, height }
}

const COMMUNITY_COLORS = [
  '#f2b134', '#5fb3b3', '#e07a5f', '#81b29a',
  '#9d8df1', '#e5a5c4', '#6fa8dc', '#f4845f',
]

function colorForCommunity(community: number | undefined): string {
  if (community === undefined) return '#8a8a8a'
  return COMMUNITY_COLORS[community % COMMUNITY_COLORS.length]
}

function strokeStyleForConfidence(confidence: string): { strokeDasharray?: string; opacity: number } {
  if (confidence === 'INFERRED') return { strokeDasharray: '4 3', opacity: 0.7 }
  if (confidence === 'AMBIGUOUS') return { strokeDasharray: '1 3', opacity: 0.5 }
  return { opacity: 0.9 }
}

async function openNode(node: PositionedNode, projectRoot: string | null): Promise<void> {
  if (!projectRoot) return
  const absolutePath = `${projectRoot}/${node.source_file}`
  await openFile(absolutePath)
}

export function GraphView({ graph }: { graph: GraphifyGraph }) {
  const projectRoot = useFileStore((s) => s.projectRoot)
  const layout = useMemo(() => computeGraphLayout(graph.nodes, graph.links, WIDTH, HEIGHT), [graph])
  const fullViewBox = useMemo(() => computeViewBox(layout.nodes), [layout.nodes])

  const svgRef = useRef<SVGSVGElement>(null)
  const [viewBox, setViewBox] = useState<ViewBox>(() => zoomedInViewBox(fullViewBox))
  // Reset to the zoomed-in starting view whenever a new graph is loaded
  // (fullViewBox changes identity only when layout.nodes does).
  useEffect(() => {
    setViewBox(zoomedInViewBox(fullViewBox))
  }, [fullViewBox])

  const dragRef = useRef<{ startX: number; startY: number; startViewBox: ViewBox; moved: boolean } | null>(null)
  const justDraggedRef = useRef(false)

  function handleWheel(e: ReactWheelEvent<SVGSVGElement>) {
    const svg = svgRef.current
    if (!svg) return
    e.preventDefault()
    const rect = svg.getBoundingClientRect()
    const fx = (e.clientX - rect.left) / rect.width
    const fy = (e.clientY - rect.top) / rect.height

    setViewBox((vb) => {
      const zoomFactor = e.deltaY > 0 ? 1 + ZOOM_STEP : 1 - ZOOM_STEP
      const maxSize = Math.max(fullViewBox.width, fullViewBox.height) * MAX_ZOOM_OUT_MULTIPLIER
      const newWidth = Math.min(Math.max(vb.width * zoomFactor, MIN_ZOOM_SIZE), maxSize)
      const newHeight = Math.min(Math.max(vb.height * zoomFactor, MIN_ZOOM_SIZE), maxSize)
      // Keep the point under the cursor fixed on-screen while zooming.
      const cursorX = vb.minX + fx * vb.width
      const cursorY = vb.minY + fy * vb.height
      return {
        minX: cursorX - fx * newWidth,
        minY: cursorY - fy * newHeight,
        width: newWidth,
        height: newHeight,
      }
    })
  }

  function handlePointerDown(e: ReactPointerEvent<SVGSVGElement>) {
    e.currentTarget.setPointerCapture?.(e.pointerId)
    dragRef.current = { startX: e.clientX, startY: e.clientY, startViewBox: viewBox, moved: false }
  }

  function handlePointerMove(e: ReactPointerEvent<SVGSVGElement>) {
    const drag = dragRef.current
    const svg = svgRef.current
    if (!drag || !svg) return
    const rect = svg.getBoundingClientRect()
    const dxPixels = e.clientX - drag.startX
    const dyPixels = e.clientY - drag.startY
    if (Math.abs(dxPixels) > DRAG_CLICK_THRESHOLD || Math.abs(dyPixels) > DRAG_CLICK_THRESHOLD) {
      drag.moved = true
    }
    const scaleX = drag.startViewBox.width / rect.width
    const scaleY = drag.startViewBox.height / rect.height
    setViewBox({
      ...drag.startViewBox,
      minX: drag.startViewBox.minX - dxPixels * scaleX,
      minY: drag.startViewBox.minY - dyPixels * scaleY,
    })
  }

  function handlePointerUp() {
    if (dragRef.current?.moved) {
      justDraggedRef.current = true
      // Clears after the click event (fired synchronously right after
      // pointerup, in the same task) has had a chance to see it.
      setTimeout(() => { justDraggedRef.current = false }, 0)
    }
    dragRef.current = null
  }

  if (layout.nodes.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-fg-subtle">No nodes in this graph yet.</p>
      </div>
    )
  }

  return (
    <div className="h-full w-full bg-panel">
      <svg
        ref={svgRef}
        className="w-full h-full cursor-grab active:cursor-grabbing touch-none"
        viewBox={`${viewBox.minX} ${viewBox.minY} ${viewBox.width} ${viewBox.height}`}
        preserveAspectRatio="xMidYMid meet"
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {layout.links.map((positionedLink, i) => {
          const style = strokeStyleForConfidence(positionedLink.link.confidence)
          return (
            <line
              key={i}
              x1={positionedLink.source.x}
              y1={positionedLink.source.y}
              x2={positionedLink.target.x}
              y2={positionedLink.target.y}
              stroke="var(--color-border)"
              strokeWidth={1}
              strokeDasharray={style.strokeDasharray}
              opacity={style.opacity}
            />
          )
        })}
        {layout.nodes.map((node) => (
          <g
            key={node.id}
            transform={`translate(${node.x}, ${node.y})`}
            className="cursor-pointer"
            onClick={() => {
              if (justDraggedRef.current) return
              openNode(node, projectRoot).catch((err) => {
                console.warn(`[graphify] failed to open ${node.source_file}:`, err)
              })
            }}
          >
            <circle r={NODE_RADIUS} fill={colorForCommunity(node.community)} />
            <text x={NODE_RADIUS + 4} y={4} fontSize={11} fill="var(--color-fg)">
              {node.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
}
