import { useEffect, useState } from 'react'
import { AutocompleteIcon } from '@/components/ActivityBar/ActivityBar'
import { Switch } from '@/components/ui/Toggle'
import { footerPopupShadow } from '@/components/ui/footerPopup'
import { useAutocompleteRuntimeStore } from '@/stores/autocompleteRuntimeStore'
import { useEditorSettingsStore } from '@/stores/editorSettingsStore'
import { useGitReposStore } from '@/stores/gitReposStore'
import { useEditorStore } from '@/stores/editorStore'
import { EDITOR_SETTINGS_TAB_PATH } from '@/components/Settings/paths'
import { MODEL_CATALOG } from '../../../electron/autocomplete/catalog'
import { formatMemory } from '@/lib/memoryBreakdown'
import { useCoverNativeViews } from '@/lib/nativeViewCover'
import { FooterTooltip } from './FooterTooltip'

type FooterState = 'running' | 'snoozed' | 'starting' | 'stopped' | 'error'

const WORDS: Record<FooterState, string> = {
  running: 'Running', snoozed: 'Snoozed', starting: 'Starting…', stopped: 'Stopped', error: 'Error',
}
const DOTS: Record<FooterState, string> = {
  running: '#8fbf6a', snoozed: 'rgb(var(--color-accent))', starting: 'rgb(var(--color-accent))', stopped: 'var(--color-fg-subtle)', error: '#e0805c',
}

const snoozeButton = 'rounded-md border border-border bg-bg py-1.5 text-xs text-fg transition-colors hover:border-fg-subtle'
const primaryButton = 'flex-1 rounded-md bg-accent py-[7px] text-xs font-semibold text-on-accent transition-opacity hover:opacity-90'
const secondaryButton = 'flex-1 rounded-md border border-border py-[7px] text-xs text-fg transition-colors hover:border-fg-subtle'

// The footer's autocomplete icon and its panel (mockup "Footer 1"): snooze
// suggestions, stop or start the model, and — since this panel takes the
// inline diff button's place while autocomplete is on — the inline diff switch.
export function AutocompleteFooter() {
  const state = useAutocompleteRuntimeStore((r) => r.state)
  const busy = useAutocompleteRuntimeStore((r) => r.busy)
  const snoozedUntil = useAutocompleteRuntimeStore((r) => r.snoozedUntil)
  const isSnoozed = useAutocompleteRuntimeStore((r) => r.isSnoozed)
  const inlineDiffEnabled = useEditorSettingsStore((s) => s.inlineDiffEnabled)
  const showInlineDiff = useEditorSettingsStore((s) => s.inlineDiffFooterIcon)
  const hasRepo = useGitReposStore((s) => s.repos.length > 0)
  const [open, setOpen] = useState(false)
  useCoverNativeViews(open)

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [open])

  // snoozedUntil is read so a snooze (or its timer running out) re-renders this.
  void snoozedUntil
  const snoozed = state.phase === 'running' && isSnoozed()
  const footerState: FooterState =
    snoozed ? 'snoozed'
      : state.phase === 'running' ? 'running'
        : state.phase === 'starting' || state.phase === 'installing' || state.phase === 'downloading' ? 'starting'
          : state.phase === 'error' ? 'error'
            : 'stopped'

  const isServer = state.source?.kind === 'server'
  const modelLabel = state.source?.kind === 'managed' ? MODEL_CATALOG[state.source.modelId].label
    : state.source?.kind === 'gguf' ? (state.source.path.split('/').pop() || 'Custom model')
      : isServer ? 'Your server' : 'The model'
  const ram = state.ramBytes ? formatMemory(state.ramBytes) : null
  // The footer never starts a download: a model that isn't on disk yet is set
  // up from settings, where the download size is shown.
  const notDownloaded = !isServer && !state.modelOnDisk

  const status = (() => {
    switch (footerState) {
      case 'running': return ram && !isServer ? `${modelLabel} · ~${ram} RAM` : modelLabel
      case 'snoozed': {
        const until = typeof snoozedUntil === 'number'
          ? `No suggestions until ${new Date(snoozedUntil).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
          : 'No suggestions until you resume'
        return `${until} · model stays loaded`
      }
      case 'starting': return `Loading ${modelLabel}…`
      case 'error': return state.error?.message ?? 'Something went wrong'
      default:
        if (isServer) return 'Not connected'
        return notDownloaded ? 'Not downloaded yet' : 'Model unloaded, its memory is freed'
    }
  })()

  const runtime = useAutocompleteRuntimeStore.getState()
  const start = (force?: boolean) => { void (force ? window.api.autocompleteStart(true) : window.api.autocompleteStart()) }
  const stop = () => { runtime.resume(); void window.api.autocompleteStop() }
  const openSettings = () => {
    useEditorStore.getState().openTab({ path: EDITOR_SETTINGS_TAB_PATH, content: '', dirty: false })
    setOpen(false)
  }
  const label = footerState === 'running' ? 'Autocomplete: on' : footerState === 'snoozed' ? 'Autocomplete: snoozed' : 'Autocomplete: off'
  const live = footerState === 'running' || footerState === 'snoozed'

  return (
    <div className="relative">
      <FooterTooltip label={label} hidden={open}>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((o) => !o) }}
          aria-label={label}
          aria-expanded={open}
          className={[
            'h-5 px-1 flex items-center justify-center rounded transition-colors',
            open ? 'bg-white/5' : '',
            footerState === 'running' && busy ? 'text-accent'
              : live ? 'text-fg-muted hover:text-fg'
                : 'text-fg-subtle hover:text-fg-muted',
          ].join(' ')}
        >
          <AutocompleteIcon crossedOut={!live} snoozed={snoozed} busy={footerState === 'running' && busy} />
        </button>
      </FooterTooltip>
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className={[
            'absolute bottom-full -right-3 z-50 mb-[3px] flex w-72 flex-col gap-2.5 p-3 text-xs',
            'rounded-t border border-b-0 border-border bg-popover',
            footerPopupShadow,
          ].join(' ')}
        >
          <div className="flex items-center justify-between">
            <span className="text-[0.6875rem] font-semibold tracking-[0.04em] text-fg-muted">AUTOCOMPLETE</span>
            <span className="flex items-center gap-1.5" style={{ color: DOTS[footerState] }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: DOTS[footerState] }} />
              {WORDS[footerState]}
            </span>
          </div>
          <div className="-mt-1 text-fg-muted">{status}</div>

          {footerState === 'running' && (
            <div className="flex flex-col gap-1.5">
              <span className="text-fg">Snooze suggestions</span>
              <div className="grid grid-cols-3 gap-1.5">
                <button type="button" className={snoozeButton} onClick={() => runtime.snooze(15)}>15 min</button>
                <button type="button" className={snoozeButton} onClick={() => runtime.snooze(60)}>1 hour</button>
                <button type="button" className={snoozeButton} onClick={() => runtime.snooze('resume')}>Until resumed</button>
              </div>
            </div>
          )}

          {(snoozed || !isServer) && (
            <div className="flex gap-1.5 empty:hidden">
              {snoozed && <button type="button" className={primaryButton} onClick={() => runtime.resume()}>Resume now</button>}
              {!isServer && footerState === 'stopped' && (notDownloaded
                ? <button type="button" className={primaryButton} onClick={openSettings}>Set up in settings…</button>
                : <button type="button" className={primaryButton} onClick={() => start()}>{ram ? `Start · ~${ram}` : 'Start'}</button>
              )}
              {!isServer && footerState === 'error' && (
                state.error?.kind === 'no-fit'
                  ? <button type="button" className={secondaryButton} onClick={() => start(true)}>Start anyway</button>
                  : <button type="button" className={primaryButton} onClick={() => start()}>Retry</button>
              )}
              {!isServer && live && (
                <button type="button" className={secondaryButton} onClick={stop}>{snoozed || !ram ? 'Stop model' : `Stop model · free ${ram}`}</button>
              )}
            </div>
          )}

          {showInlineDiff && hasRepo && (
            <div className="flex items-center justify-between gap-3 border-t border-border pt-2.5">
              <span className="flex flex-col">
                <span className="text-fg">Inline diff</span>
                <span className="text-[0.6875rem] text-fg-muted">Highlight changed lines and words</span>
              </span>
              <Switch label="Inline diff" checked={inlineDiffEnabled} onChange={() => useEditorSettingsStore.getState().toggleInlineDiff()} />
            </div>
          )}

          <div className="border-t border-border pt-2">
            <button
              type="button"
              className="text-xs text-accent hover:underline"
              onClick={openSettings}
            >
              Autocomplete settings…
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
