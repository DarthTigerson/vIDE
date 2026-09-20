import { clipboard } from 'electron'
import {
  toFileUrl, encodeGnomeCopiedFiles, decodeGnomeCopiedFiles,
  decodeUriList, decodeFilenamesPlist, decodeFileUrl,
  type ClipboardFiles, type ClipboardMode,
} from './fileClipboardFormats'

// Electron's writeBuffer replaces the whole clipboard, so only one format can
// be written per call. Copy/Cut in the tree is single-item, so on macOS the
// first path as public.file-url is all Finder needs; macOS has no OS-level cut,
// so `mode` is ignored there (vIDE remembers the cut itself).
export function writeClipboardFiles(paths: string[], mode: ClipboardMode): void {
  if (paths.length === 0) return
  if (process.platform === 'darwin') {
    clipboard.writeBuffer('public.file-url', Buffer.from(toFileUrl(paths[0]), 'utf8'))
  } else {
    clipboard.writeBuffer('x-special/gnome-copied-files', Buffer.from(encodeGnomeCopiedFiles(paths, mode), 'utf8'))
  }
}

function readText(format: string): string {
  return clipboard.readBuffer(format).toString('utf8')
}

export function readClipboardFiles(): ClipboardFiles | null {
  if (process.platform === 'darwin') {
    return decodeFilenamesPlist(readText('NSFilenamesPboardType')) ?? decodeFileUrl(readText('public.file-url'))
  }
  return decodeGnomeCopiedFiles(readText('x-special/gnome-copied-files')) ?? decodeUriList(readText('text/uri-list'))
}
