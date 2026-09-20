import { fileURLToPath, pathToFileURL } from 'url'

export type ClipboardMode = 'copy' | 'cut'

export interface ClipboardFiles {
  paths: string[]
  mode: ClipboardMode
}

export function toFileUrl(path: string): string {
  return pathToFileURL(path).href
}

function filesOrNull(paths: string[], mode: ClipboardMode): ClipboardFiles | null {
  return paths.length > 0 ? { paths, mode } : null
}

function urlsToPaths(lines: string[]): string[] {
  return lines
    .map((line) => line.trim().replace(/\u0000/g, ''))
    .filter((line) => line.startsWith('file://'))
    .map((line) => fileURLToPath(line))
}

// Linux (GNOME/Nautilus, also read by most other file managers):
// "copy\nfile:///a\nfile:///b" or "cut\nfile:///a".
export function encodeGnomeCopiedFiles(paths: string[], mode: ClipboardMode): string {
  return `${mode}\n${paths.map(toFileUrl).join('\n')}`
}

export function decodeGnomeCopiedFiles(text: string): ClipboardFiles | null {
  const [head, ...rest] = text.split(/\r?\n/)
  if (head !== 'copy' && head !== 'cut') return null
  return filesOrNull(urlsToPaths(rest), head)
}

export function decodeUriList(text: string): ClipboardFiles | null {
  const lines = text.split(/\r?\n/).filter((line) => !line.startsWith('#'))
  return filesOrNull(urlsToPaths(lines), 'copy')
}

function unescapeXml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

// macOS NSFilenamesPboardType: an XML property list, <array><string>path</string>…
export function decodeFilenamesPlist(xml: string): ClipboardFiles | null {
  const paths = [...xml.matchAll(/<string>([\s\S]*?)<\/string>/g)].map((m) => unescapeXml(m[1]))
  return filesOrNull(paths, 'copy')
}

// macOS public.file-url: a single file:// URL (possibly NUL/newline terminated).
export function decodeFileUrl(text: string): ClipboardFiles | null {
  return filesOrNull(urlsToPaths([text]), 'copy')
}
