import { useCallback, useEffect, useState } from 'react'
import { Select } from '@/components/ui/Select'
import { Switch } from '@/components/ui/Toggle'
import { formatMemory } from '@/lib/memoryBreakdown'
import {
  DONE_SOUND_OPTIONS, MAX_SPEED, MIN_SPEED, READ_ALOUD_OPTIONS, playDoneSound, speak, stopPlayback, useDoneFeedbackStore,
  type DoneMode, type ReadAloud,
} from '@/stores/doneFeedbackStore'
import type { TtsVoiceInfo } from '@/types/api'
import { DoneModeIcon } from '@/components/ActivityBar/DoneModeMenu'
import { FeatureBlock, SettingRow } from './FeatureBlock'
import { ToolInstallRow } from './ToolInstallRow'
import { PreviewFrame } from './previews/primitives'

const MODE_OPTIONS: { value: DoneMode; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'sound', label: 'Done sound' },
  { value: 'speak', label: 'Speak' },
]

const DEFAULT_TEST_PHRASE = 'All tests pass. Three files changed.'

const secondaryButton = 'shrink-0 whitespace-nowrap rounded-lg border border-border px-3.5 py-1.5 text-sm text-fg transition-colors hover:border-fg-subtle disabled:opacity-40'
const iconButton = 'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-fg transition-colors hover:border-fg-subtle disabled:opacity-40'
const inputClass = 'rounded-lg border border-border bg-bg px-2 py-1 text-sm text-fg focus:border-accent/60 focus:outline-hidden'

const getInstall = () => window.api.ttsGetInstall()
const install = () => window.api.ttsInstall()
const onProgress = (cb: (received: number, total: number) => void) => window.api.onTtsInstallProgress(cb)

function percent(received: number, total: number): number {
  return total > 0 ? Math.min(100, Math.floor((received / total) * 100)) : 0
}

// Same card as the autocomplete model picker: gold border when picked.
function VoiceCard({ voice, selected, progress, error, onPick, onDownload, onPlay }: {
  voice: TtsVoiceInfo
  selected: boolean
  progress: number | null
  error: string | null
  onPick: () => void
  onDownload: () => void
  onPlay: () => void
}) {
  return (
    <div
      className={[
        'flex min-h-24 flex-col justify-between rounded-lg border p-3 transition-colors',
        selected ? 'border-accent bg-sidebar' : 'border-border bg-bg hover:border-fg-subtle',
      ].join(' ')}
    >
      <button type="button" aria-pressed={selected} onClick={onPick} className="flex flex-col items-start text-left">
        <span className="flex w-full items-center justify-between gap-1.5">
          <span className="text-[0.8125rem] font-semibold text-fg">{voice.name}</span>
          {voice.recommended && (
            <span className="rounded-sm bg-accent px-1.5 py-px text-[0.625rem] font-semibold text-on-accent">Recommended</span>
          )}
        </span>
        <span className="mt-0.5 text-xs text-fg-muted">{voice.description}</span>
      </button>
      <span className="mt-2.5 flex items-center justify-between gap-1.5">
        <span className={['text-[0.6875rem]', error ? 'text-red-400' : 'text-fg-subtle'].join(' ')}>
          {error ?? (voice.installed ? 'Downloaded' : formatMemory(voice.bytes))}
        </span>
        {voice.installed ? (
          <button type="button" aria-label={`Play ${voice.name}`} title="Play" onClick={onPlay} className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-[0.625rem] text-fg transition-colors hover:border-fg-subtle">▶</button>
        ) : (
          <button type="button" onClick={onDownload} disabled={progress !== null} className="rounded-lg border border-border px-2.5 py-0.5 text-xs text-fg transition-colors hover:border-fg-subtle disabled:opacity-60">
            {progress !== null ? `${progress}%` : error ? 'Retry' : 'Download'}
          </button>
        )}
      </span>
    </div>
  )
}

// A picture of the activity-bar popover the speaker button opens.
function DoneModePreview({ mode }: { mode: DoneMode }) {
  return (
    <PreviewFrame testId="done-mode-preview" caption="Activity bar">
      <div className="flex items-start gap-1.5 p-2.5 pt-1.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-sm bg-white/10 text-fg [&>svg]:h-4 [&>svg]:w-4">
          <DoneModeIcon mode={mode} />
        </span>
        <div className="w-40 rounded-sm border border-border bg-sidebar p-1">
          <div className="flex gap-0.5 rounded-sm bg-black/20 p-0.5">
            {MODE_OPTIONS.map((o) => (
              <span key={o.value} className={['flex h-5 flex-1 items-center justify-center rounded-xs text-[10px]', o.value === mode ? 'bg-white/10 text-fg' : 'text-fg-muted'].join(' ')}>
                {o.value === 'sound' ? 'Sound' : o.label}
              </span>
            ))}
          </div>
          <div className="px-1.5 pb-0.5 pt-1 text-[10px] text-fg-subtle">Sound &amp; Voice settings…</div>
        </div>
      </div>
    </PreviewFrame>
  )
}

export function SoundSettingsPage() {
  const mode = useDoneFeedbackStore((s) => s.mode)
  const setMode = useDoneFeedbackStore((s) => s.setMode)
  const agents = useDoneFeedbackStore((s) => s.agents)
  const setAgent = useDoneFeedbackStore((s) => s.setAgent)
  const soundId = useDoneFeedbackStore((s) => s.soundId)
  const setSoundId = useDoneFeedbackStore((s) => s.setSoundId)
  const voiceId = useDoneFeedbackStore((s) => s.voiceId)
  const setVoiceId = useDoneFeedbackStore((s) => s.setVoiceId)
  const readAloud = useDoneFeedbackStore((s) => s.readAloud)
  const setReadAloud = useDoneFeedbackStore((s) => s.setReadAloud)
  const speed = useDoneFeedbackStore((s) => s.speed)
  const setSpeed = useDoneFeedbackStore((s) => s.setSpeed)

  const [voices, setVoices] = useState<TtsVoiceInfo[]>([])
  const [engineReady, setEngineReady] = useState(false)
  const [progress, setProgress] = useState<Record<string, number>>({})
  const [voiceErrors, setVoiceErrors] = useState<Record<string, string>>({})
  const [testPhrase, setTestPhrase] = useState(DEFAULT_TEST_PHRASE)
  const [playError, setPlayError] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)

  const refresh = useCallback(() => {
    window.api.ttsListVoices().then(setVoices).catch(() => {})
    window.api.ttsGetInstall().then((info) => setEngineReady(!!info.path)).catch(() => {})
  }, [])

  useEffect(() => {
    refresh()
    const unsubscribe = window.api.onTtsVoiceProgress((id, received, total) => {
      setProgress((p) => ({ ...p, [id]: percent(received, total) }))
    })
    return () => {
      unsubscribe()
      stopPlayback()
    }
  }, [refresh])

  const download = async (id: string) => {
    setVoiceErrors(({ [id]: _, ...rest }) => rest)
    setProgress((p) => ({ ...p, [id]: 0 }))
    const result = await window.api.ttsInstallVoice(id)
    setProgress(({ [id]: _, ...rest }) => rest)
    if (!result.ok) setVoiceErrors((e) => ({ ...e, [id]: result.error }))
    else if (!voices.some((v) => v.id === voiceId && v.installed)) setVoiceId(id)
    refresh()
  }

  const play = async (text: string, id: string) => {
    setPlayError(null)
    setPlaying(true)
    try {
      const ok = await speak(text, id, speed)
      if (!ok) setPlayError(engineReady ? 'Could not speak with that voice.' : 'Install the speech engine first.')
    } finally {
      setPlaying(false)
    }
  }

  const selectedVoice = voices.find((v) => v.id === voiceId)
  const canPlay = engineReady && !!selectedVoice?.installed

  return (
    <div className="h-full overflow-auto bg-panel p-6">
      <div className="max-w-[1000px]">
        <h1 className="mb-1 text-base font-semibold text-fg">Sound &amp; Voice</h1>
        <p className="mb-4 text-sm text-fg-muted">What vIDE does when Claude or Rocky finishes. Speech runs on this machine.</p>

        <FeatureBlock
          title="When an agent finishes"
          description="Off, a done sound, or the reply spoken aloud. The speaker button in the activity bar switches this too."
          preview={<DoneModePreview mode={mode} />}
        >
          <SettingRow label="Mode" htmlFor="done-mode-select">
            <div className="w-44">
              <Select id="done-mode-select" value={mode} onChange={(v) => setMode(v as DoneMode)} options={MODE_OPTIONS} ariaLabel="Mode" />
            </div>
          </SettingRow>
          <SettingRow label="Claude" sub>
            <Switch label="Claude" checked={agents.claude} onChange={(on) => setAgent('claude', on)} />
          </SettingRow>
          <SettingRow label="Rocky" sub>
            <Switch label="Rocky" checked={agents.rocky} onChange={(on) => setAgent('rocky', on)} />
          </SettingRow>
        </FeatureBlock>

        <FeatureBlock title="Done sound" description="Plays in Done sound mode, and in Speak mode when no voice is ready.">
          <SettingRow label="Sound" htmlFor="done-sound-select">
            <div className="flex items-center gap-2">
              <div className="w-44">
                <Select
                  id="done-sound-select"
                  value={soundId}
                  onChange={setSoundId}
                  options={DONE_SOUND_OPTIONS.map((s) => ({ value: s.id, label: s.label }))}
                  ariaLabel="Sound"
                />
              </div>
              <button type="button" onClick={() => playDoneSound(soundId)} aria-label="Test sound" title="Test sound" className={iconButton}>
                <span className="[&>svg]:h-3.5 [&>svg]:w-3.5"><DoneModeIcon mode="sound" /></span>
              </button>
            </div>
          </SettingRow>
        </FeatureBlock>

        <FeatureBlock title="Voice" description="Used in Speak mode. Runs locally, nothing is sent anywhere.">
          <ToolInstallRow
            name="Speech engine"
            notInstalled="Not installed. vIDE can download the sherpa-onnx speech engine for you, no Homebrew needed."
            getInstall={getInstall}
            install={install}
            onProgress={onProgress}
            onInstalled={refresh}
          />

          <div className="mt-2.5 grid max-w-[640px] grid-cols-3 gap-2">
            {voices.map((v) => (
              <VoiceCard
                key={v.id}
                voice={v}
                selected={v.id === voiceId}
                progress={progress[v.id] ?? null}
                error={voiceErrors[v.id] ?? null}
                onPick={() => setVoiceId(v.id)}
                onDownload={() => download(v.id)}
                onPlay={() => play(testPhrase, v.id)}
              />
            ))}
          </div>

          <div className="mt-3">
            <SettingRow label="Read aloud" htmlFor="read-aloud-select" description="How much of the reply to speak.">
              <div className="w-44">
                <Select id="read-aloud-select" value={readAloud} onChange={(v) => setReadAloud(v as ReadAloud)} options={READ_ALOUD_OPTIONS} ariaLabel="Read aloud" />
              </div>
            </SettingRow>
            <SettingRow label="Speed" htmlFor="tts-speed">
              <span className="flex items-center gap-2">
                <input
                  id="tts-speed"
                  type="number"
                  min={MIN_SPEED}
                  max={MAX_SPEED}
                  step={0.1}
                  value={speed}
                  onChange={(e) => setSpeed(Number(e.target.value))}
                  className={`w-16 ${inputClass}`}
                />
                <span className="text-sm text-fg-muted">×</span>
              </span>
            </SettingRow>
            <SettingRow label="Test phrase" htmlFor="tts-test-phrase" description={playError ?? undefined} stacked>
              <div className="flex gap-2">
                <input id="tts-test-phrase" value={testPhrase} onChange={(e) => setTestPhrase(e.target.value)} className={`min-w-0 flex-1 ${inputClass}`} />
                <button type="button" onClick={() => play(testPhrase, voiceId)} disabled={!canPlay || playing || !testPhrase.trim()} className={secondaryButton}>
                  {playing ? 'Speaking…' : 'Play'}
                </button>
              </div>
            </SettingRow>
          </div>
        </FeatureBlock>
      </div>
    </div>
  )
}
