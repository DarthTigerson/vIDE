import type { ReadAloud } from '@/stores/doneFeedbackStore'

// Longest a spoken reply gets, so a long turn doesn't talk for minutes.
const FIRST_MAX = 280
const FULL_MAX = 1200

// Markdown and code read badly aloud: code blocks go, inline code and links
// keep their text, URLs, headings, bullets, emphasis and table pipes go.
export function plainSpeech(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?(```|$)/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*\|?[\s:|-]+\|[\s:|-]*$/gm, ' ')
    .replace(/\|/g, ' ')
    .replace(/(\*\*|\*|~~)(?=\S)([\s\S]*?\S)\1/g, '$2')
    // Underscore emphasis only at word edges, so snake_case names stay intact.
    .replace(/(?<!\w)(__|_)(?=\S)([\s\S]*?\S)\1(?!\w)/g, '$2')
    .replace(/[ \t]*\n+[ \t]*/g, '. ')
    .replace(/\s+/g, ' ')
    .replace(/(?:\.\s*){2,}/g, '. ')
    .replace(/([!?:;,])\.\s/g, '$1 ')
    .trim()
    .replace(/^\.\s*/, '')
}

// Cuts at the last sentence end before max, else at the last word.
function cap(text: string, max: number): string {
  if (text.length <= max) return text
  const head = text.slice(0, max)
  const sentenceEnd = Math.max(head.lastIndexOf('. '), head.lastIndexOf('! '), head.lastIndexOf('? '))
  if (sentenceEnd > max / 3) return head.slice(0, sentenceEnd + 1)
  const space = head.lastIndexOf(' ')
  return (space > 0 ? head.slice(0, space) : head) + '…'
}

export function firstSentence(text: string): string {
  const match = text.match(/^.*?[.!?](?=\s|$)/)
  return cap(match ? match[0] : text, FIRST_MAX)
}

// What to say when an agent finishes. `agentName` is "Claude" or "Rocky";
// a turn with no text (tools only) says the short line whatever the setting.
export function speechFor(reply: string, readAloud: ReadAloud, agentName: string): string {
  const fallback = `${agentName} finished.`
  if (readAloud === 'done') return fallback
  const plain = plainSpeech(reply)
  if (!plain) return fallback
  return readAloud === 'full' ? cap(plain, FULL_MAX) : firstSentence(plain)
}
