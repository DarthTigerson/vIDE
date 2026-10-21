// Splits streamed assistant content into visible text and reasoning. Servers
// with a reasoning parser (llama.cpp's default, vLLM) send reasoning in its own
// delta field; models served without one (Qwen3, DeepSeek-R1 on a plain
// endpoint) inline it as <think>…</think> in the content. Tags can be split
// across chunks, so a possible partial tag at the end of a chunk is held back
// until the next one.

const OPEN = '<think>'
const CLOSE = '</think>'

export interface SplitDelta {
  text: string
  reasoning: string
}

// Length of the longest suffix of `s` that is a proper prefix of `tag`.
function partialTagSuffix(s: string, tag: string): number {
  for (let n = Math.min(tag.length - 1, s.length); n > 0; n--) {
    if (tag.startsWith(s.slice(-n))) return n
  }
  return 0
}

export class ThinkTagSplitter {
  private inThink = false
  private pending = ''

  push(chunk: string): SplitDelta {
    let s = this.pending + chunk
    this.pending = ''
    let text = ''
    let reasoning = ''
    while (s) {
      const tag = this.inThink ? CLOSE : OPEN
      const at = s.indexOf(tag)
      if (at >= 0) {
        if (this.inThink) reasoning += s.slice(0, at)
        else text += s.slice(0, at)
        s = s.slice(at + tag.length)
        this.inThink = !this.inThink
        continue
      }
      const keep = partialTagSuffix(s, tag)
      const out = s.slice(0, s.length - keep)
      if (this.inThink) reasoning += out
      else text += out
      this.pending = s.slice(s.length - keep)
      break
    }
    return { text, reasoning }
  }

  // End of stream: whatever was held back as a possible tag is plain output.
  flush(): SplitDelta {
    const rest = this.pending
    this.pending = ''
    return this.inThink ? { text: '', reasoning: rest } : { text: rest, reasoning: '' }
  }
}
