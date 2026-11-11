import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy, RenderTask, TextLayer } from 'pdfjs-dist'
import './pdfTextLayer.css'

type PdfJs = typeof import('pdfjs-dist')

// pdf.js (and its worker) only load the first time a PDF opens, so they cost
// nothing for a session that never views one.
let pdfjsPromise: Promise<PdfJs> | null = null
function loadPdfJs(): Promise<PdfJs> {
  pdfjsPromise ??= Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]).then(([pdfjs, worker]) => {
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default
    return pdfjs
  })
  return pdfjsPromise
}

type Size = { width: number; height: number }
type Zoom = 'fit' | number

const PAGE_GAP = 12
const SIDE_PADDING = 24
const MIN_ZOOM = 0.25
const MAX_ZOOM = 4
const ZOOM_STEP = 1.2

export function PdfViewer({ path }: { path: string }) {
  const name = path.split('/').pop() ?? path
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [pdfjs, setPdfjs] = useState<PdfJs | null>(null)
  const [sizes, setSizes] = useState<Size[]>([])
  const [error, setError] = useState(false)
  const [zoom, setZoom] = useState<Zoom>('fit')
  const [containerWidth, setContainerWidth] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageInput, setPageInput] = useState('1')
  const scrollRef = useRef<HTMLDivElement>(null)
  const pageRefs = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    let cancelled = false
    let loaded: PDFDocumentProxy | null = null
    setDoc(null)
    setSizes([])
    setError(false)
    ;(async () => {
      const lib = await loadPdfJs()
      const data = await window.api.readFileBytes(path)
      const task = lib.getDocument({ data, isEvalSupported: false })
      const pdf = await task.promise
      if (cancelled) { void pdf.destroy(); return }
      loaded = pdf
      // Every page's size up front (no rendering), so the scroll height is
      // right before any page has been drawn.
      const pageSizes: Size[] = []
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        const { width, height } = page.getViewport({ scale: 1 })
        pageSizes.push({ width, height })
        if (cancelled) return
      }
      setPdfjs(lib)
      setDoc(pdf)
      setSizes(pageSizes)
    })().catch(() => { if (!cancelled) setError(true) })
    return () => {
      cancelled = true
      void loaded?.destroy()
    }
  }, [path])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const observer = new ResizeObserver(() => setContainerWidth(el.clientWidth))
    observer.observe(el)
    setContainerWidth(el.clientWidth)
    return () => observer.disconnect()
  }, [doc])

  const widest = sizes.reduce((max, s) => Math.max(max, s.width), 0)
  const fitScale = widest && containerWidth ? Math.max(MIN_ZOOM, (containerWidth - SIDE_PADDING * 2) / widest) : 1
  const scale = zoom === 'fit' ? fitScale : zoom

  // Keep the same spot in the document in view when the scale changes.
  const scrollRatio = useRef(0)
  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    scrollRatio.current = el.scrollHeight ? el.scrollTop / el.scrollHeight : 0
    const middle = el.scrollTop + el.clientHeight / 3
    let page = 1
    pageRefs.current.forEach((node, i) => {
      if (node && node.offsetTop <= middle) page = i + 1
    })
    setCurrentPage(page)
  }, [])
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = scrollRatio.current * el.scrollHeight
  }, [scale])

  useEffect(() => { setPageInput(String(currentPage)) }, [currentPage])

  const goToPage = (page: number) => {
    const target = pageRefs.current[Math.min(Math.max(page, 1), sizes.length) - 1]
    if (target && scrollRef.current) scrollRef.current.scrollTop = target.offsetTop - PAGE_GAP
  }

  const zoomBy = (factor: number) =>
    setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(scale * factor * 100) / 100)))

  if (error) {
    return (
      <div className="h-full flex items-center justify-center bg-panel">
        <p className="text-sm text-fg-subtle">Couldn't load {name}</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-panel">
      <div className="flex items-center gap-2 px-3 h-8 shrink-0 border-b border-border text-xs text-fg-subtle">
        <span className="font-mono truncate min-w-0 flex-1">{name}</span>
        {doc && (
          <>
            <span className="flex items-center gap-1">
              <input
                aria-label="Page"
                value={pageInput}
                onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ''))}
                onKeyDown={(e) => { if (e.key === 'Enter') goToPage(Number(pageInput) || 1) }}
                onBlur={() => setPageInput(String(currentPage))}
                className="w-10 rounded border border-border bg-transparent px-1 text-center text-fg"
              />
              / {sizes.length}
            </span>
            <span className="mx-1 h-4 w-px bg-border" />
            <ToolbarButton label="Zoom out" onClick={() => zoomBy(1 / ZOOM_STEP)} disabled={scale <= MIN_ZOOM}>−</ToolbarButton>
            <span className="w-10 text-center tabular-nums">{Math.round(scale * 100)}%</span>
            <ToolbarButton label="Zoom in" onClick={() => zoomBy(ZOOM_STEP)} disabled={scale >= MAX_ZOOM}>+</ToolbarButton>
            <ToolbarButton label="Fit width" onClick={() => setZoom('fit')} active={zoom === 'fit'}>Fit</ToolbarButton>
          </>
        )}
      </div>
      <div ref={scrollRef} onScroll={onScroll} className="flex-1 min-h-0 overflow-auto">
        {!doc || !pdfjs ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-sm text-fg-subtle">Loading…</p>
          </div>
        ) : (
          <div className="flex flex-col items-center" style={{ gap: PAGE_GAP, padding: `${PAGE_GAP}px ${SIDE_PADDING}px` }}>
            {sizes.map((size, i) => (
              <PdfPage
                key={i}
                pageRef={(node) => { pageRefs.current[i] = node }}
                pdfjs={pdfjs}
                doc={doc}
                pageNumber={i + 1}
                size={size}
                scale={scale}
                root={scrollRef}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ToolbarButton({ label, onClick, disabled, active, children }: {
  label: string
  onClick: () => void
  disabled?: boolean
  active?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`min-w-6 h-6 px-1.5 rounded hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-transparent ${active ? 'text-fg bg-white/10' : ''}`}
    >
      {children}
    </button>
  )
}

interface PdfPageProps {
  pdfjs: PdfJs
  doc: PDFDocumentProxy
  pageNumber: number
  size: Size
  scale: number
  root: React.RefObject<HTMLDivElement | null>
  pageRef: (node: HTMLDivElement | null) => void
}

// One page: a placeholder of the right size that only draws its canvas and
// text layer while near the viewport, and drops them again once scrolled far
// away, so a long PDF holds a handful of canvases rather than one per page.
function PdfPage({ pdfjs, doc, pageNumber, size, scale, root, pageRef }: PdfPageProps) {
  const boxRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textRef = useRef<HTMLDivElement>(null)
  const [near, setNear] = useState(false)

  const setBox = useCallback((node: HTMLDivElement | null) => {
    boxRef.current = node
    pageRef(node)
  }, [pageRef])

  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    const observer = new IntersectionObserver(
      ([entry]) => setNear(entry.isIntersecting),
      { root: root.current, rootMargin: '100% 0px' },
    )
    observer.observe(box)
    return () => observer.disconnect()
  }, [root])

  useEffect(() => {
    if (!near) return
    let cancelled = false
    let renderTask: RenderTask | null = null
    let textLayer: TextLayer | null = null
    ;(async () => {
      const page = await doc.getPage(pageNumber)
      const canvas = canvasRef.current
      const text = textRef.current
      if (cancelled || !canvas || !text) return
      const viewport = page.getViewport({ scale })
      const ratio = window.devicePixelRatio || 1
      canvas.width = Math.floor(viewport.width * ratio)
      canvas.height = Math.floor(viewport.height * ratio)
      renderTask = page.render({
        canvas,
        viewport,
        transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
      })
      text.replaceChildren()
      textLayer = new pdfjs.TextLayer({ textContentSource: page.streamTextContent(), container: text, viewport })
      await Promise.all([renderTask.promise, textLayer.render()])
    })().catch(() => {
      // cancelled by a scroll or zoom, or a page pdf.js can't draw: it stays blank
    })
    return () => {
      cancelled = true
      renderTask?.cancel()
      textLayer?.cancel()
    }
  }, [near, doc, pageNumber, scale, pdfjs])

  const width = Math.floor(size.width * scale)
  const height = Math.floor(size.height * scale)
  return (
    <div
      ref={setBox}
      data-page={pageNumber}
      className="relative shrink-0 bg-white shadow-md shadow-black/30"
      style={{
        width,
        height,
        ['--total-scale-factor' as string]: scale,
        ['--scale-round-x' as string]: '1px',
        ['--scale-round-y' as string]: '1px',
      }}
    >
      {near && (
        <>
          <canvas ref={canvasRef} className="absolute inset-0" style={{ width, height }} />
          <div ref={textRef} className="textLayer" />
        </>
      )}
    </div>
  )
}
