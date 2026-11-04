import { SVG_MODES, useExtensionsStore, type SvgMode } from '@/stores/extensionsStore'
import { applySvgMode, showSvgPreview, showSvgSource } from '@/lib/svgView'

const MODE_LABELS: Record<SvgMode, string> = { preview: 'Preview', toggle: 'Toggle', split: 'Split' }

// Sits at the right edge of the breadcrumb bar on an SVG's viewer and source
// tabs: a per-file mode switcher, plus in toggle mode the button that flips
// between the rendered view and the XML source.
export function SvgModeControls({ filePath, onSource, paneId }: {
  filePath: string
  // True on the file's editor tab, false on its viewer tab.
  onSource: boolean
  paneId: string
}) {
  const mode = useExtensionsStore((s) => s.svgModes[filePath] ?? s.svgDefaultMode)
  const buttonClass = 'px-2.5 h-full border-l border-border text-[0.6875rem] font-medium transition-colors'

  return (
    <div className="flex h-full items-stretch">
      {mode === 'toggle' && (
        <button
          type="button"
          onClick={() => void (onSource ? showSvgPreview(filePath) : showSvgSource(filePath))}
          className={`${buttonClass} bg-white/5 text-fg-muted hover:text-fg hover:bg-accent/20`}
        >
          {onSource ? 'Show preview' : 'Edit source'}
        </button>
      )}
      <div role="group" aria-label="SVG view mode" className="flex h-full items-stretch">
        {SVG_MODES.map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => void applySvgMode(filePath, m, paneId)}
            className={`${buttonClass} ${mode === m ? 'bg-accent/20 text-fg' : 'bg-white/5 text-fg-muted hover:text-fg hover:bg-accent/20'}`}
          >
            {MODE_LABELS[m]}
          </button>
        ))}
      </div>
    </div>
  )
}
