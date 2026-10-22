// Where llama-server is in the current request, read from its log: it prints
// a line per prompt batch ("prompt processing progress, …, progress = 0.51"),
// one when the prompt is done, and nothing while it generates. Only the tail
// is scanned; the newest matching line wins.

export type LlamaPhase =
  | { kind: 'reading'; progress: number }
  | { kind: 'promptDone' }
  | { kind: 'idle' }

const TAIL_CHARS = 4000

export function llamaPhase(log: string): LlamaPhase | null {
  const lines = log.slice(-TAIL_CHARS).split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]
    const progress = /prompt processing progress.*progress = ([\d.]+)/.exec(line)
    if (progress) return { kind: 'reading', progress: Math.min(1, Number(progress[1])) }
    if (line.includes('prompt done')) return { kind: 'promptDone' }
    if (line.includes('processing task')) return { kind: 'reading', progress: 0 }
    if (line.includes('all slots are idle')) return { kind: 'idle' }
  }
  return null
}

// The same phase as one number, so a store selector can return it without a
// new object on every log chunk: 0–1 reading, 2 prompt done, 3 idle, -1 unknown.
export function llamaPhaseCode(log: string): number {
  const p = llamaPhase(log)
  if (!p) return -1
  return p.kind === 'reading' ? p.progress : p.kind === 'promptDone' ? 2 : 3
}
