// Local speech for the "Speak" done mode (Settings › Sound & Voice).
//
// Engine: sherpa-onnx's prebuilt CLI, pinned. Piper's own macOS arm64 release
// ships x86_64 binaries, so Piper voices are run through sherpa-onnx instead,
// which has real Apple Silicon and Linux builds. Each utterance is one
// short-lived process, so nothing stays resident between turns.

export const SHERPA_TAG = 'v2.0.3'

const RELEASES = 'https://github.com/k2-fsa/sherpa-onnx/releases/download'

export interface EngineAsset { url: string; bytes: number }

export function engineAsset(platform: NodeJS.Platform, arch: string = process.arch): EngineAsset | null {
  if (platform === 'darwin' && arch === 'arm64') {
    return { url: `${RELEASES}/${SHERPA_TAG}/sherpa-onnx-${SHERPA_TAG}-osx-arm64-shared.tar.bz2`, bytes: 21914267 }
  }
  if (platform === 'linux' && arch === 'x64') {
    return { url: `${RELEASES}/${SHERPA_TAG}/sherpa-onnx-${SHERPA_TAG}-linux-x64-shared.tar.bz2`, bytes: 29936514 }
  }
  return null
}

// What the settings page lists (tts:listVoices).
export interface TtsVoiceInfo { id: string; name: string; description: string; bytes: number; recommended: boolean; installed: boolean }

export interface Voice {
  id: string
  name: string
  // e.g. "English (US) · female"
  description: string
  // Piper model name; the archive is vits-piper-<model>.tar.bz2 and unpacks to
  // a folder of the same name holding <model>.onnx, tokens.txt, espeak-ng-data/.
  model: string
  bytes: number
  recommended?: boolean
}

export const VOICES: Voice[] = [
  { id: 'amy', name: 'Amy', description: 'English (US) · female', model: 'en_US-amy-medium', bytes: 67223746, recommended: true },
  { id: 'ryan', name: 'Ryan', description: 'English (US) · male', model: 'en_US-ryan-medium', bytes: 67213100 },
  { id: 'kristin', name: 'Kristin', description: 'English (US) · female', model: 'en_US-kristin-medium', bytes: 67259230 },
  { id: 'lessac', name: 'Lessac', description: 'English (US) · female', model: 'en_US-lessac-medium', bytes: 67230653 },
  { id: 'alan', name: 'Alan', description: 'English (UK) · male', model: 'en_GB-alan-medium', bytes: 67220121 },
  { id: 'jenny', name: 'Jenny', description: 'English (UK) · female', model: 'en_GB-jenny_dioco-medium', bytes: 67225842 },
  { id: 'cori', name: 'Cori', description: 'English (UK) · female', model: 'en_GB-cori-medium', bytes: 67257412 },
  { id: 'northern', name: 'Northern', description: 'English (UK) · male', model: 'en_GB-northern_english_male-medium', bytes: 67210490 },
]

export function voiceById(id: string): Voice | undefined {
  return VOICES.find((v) => v.id === id)
}

export function voiceFolder(voice: Voice): string {
  return `vits-piper-${voice.model}`
}

export function voiceUrl(voice: Voice): string {
  return `${RELEASES}/tts-models/${voiceFolder(voice)}.tar.bz2`
}

// Speed is a multiplier (1.2 = 20% faster); VITS takes a length scale, its inverse.
export function lengthScale(speed: number): number {
  const clamped = Math.min(1.5, Math.max(0.7, Number.isFinite(speed) ? speed : 1))
  return Math.round((1 / clamped) * 100) / 100
}

// Arguments for sherpa-onnx-offline-tts. Passed through execFile (no shell),
// so the text needs no quoting.
export function synthArgs(voiceDir: string, voice: Voice, speed: number, outFile: string, text: string): string[] {
  return [
    `--vits-model=${voiceDir}/${voice.model}.onnx`,
    `--vits-tokens=${voiceDir}/tokens.txt`,
    `--vits-data-dir=${voiceDir}/espeak-ng-data`,
    `--vits-length-scale=${lengthScale(speed)}`,
    '--num-threads=2',
    `--output-filename=${outFile}`,
    text,
  ]
}
