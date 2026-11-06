import { clipboard, ClipboardItem } from 'electron'
import {
  toFileUrl, encodeGnomeCopiedFiles, decodeGnomeCopiedFiles,
  decodeUriList, decodeFilenamesPlist, decodeFileUrl,
  type ClipboardFiles, type ClipboardMode,
} from './fileClipboardFormats'

// Electron 44 replaced the synchronous writeBuffer/readBuffer with the
// promise-based read()/write(). Platform-specific formats are addressed as
// `electron application/osclipboard;format="<name>"`, and `text/uri-list` maps
// to the OS's native file references (public.file-url / NSFilenamesPboardType
// on macOS), so Finder sees the files without a hand-written pasteboard type.
const rawFormat = (name: string): string => `electron application/osclipboard;format="${name}"`

// Copy/Cut in the tree is single-item, but a uri-list carries all the paths.
// macOS has no OS-level cut, so `mode` is ignored there (vIDE remembers the
// cut itself); Linux file managers read the cut/copy flag from
// x-special/gnome-copied-files, written alongside the uri-list.
export async function writeClipboardFiles(paths: string[], mode: ClipboardMode): Promise<void> {
  if (paths.length === 0) return
  const uriList = paths.map(toFileUrl).join('\r\n')
  if (process.platform === 'darwin') {
    await clipboard.write([new ClipboardItem({ 'text/uri-list': uriList })])
  } else {
    await clipboard.write([
      new ClipboardItem({
        [rawFormat('x-special/gnome-copied-files')]: encodeGnomeCopiedFiles(paths, mode),
        'text/uri-list': uriList,
      }),
    ])
  }
}

async function readText(...formats: string[]): Promise<string> {
  let items: Electron.ClipboardItem[]
  try {
    items = await clipboard.read()
  } catch {
    return ''
  }
  for (const format of formats) {
    for (const item of items) {
      if (!item.types.includes(format)) continue
      try {
        return await ((await item.getType(format)) as Blob).text()
      } catch {
        // Not readable as text; try the next candidate.
      }
    }
  }
  return ''
}

export async function readClipboardFiles(): Promise<ClipboardFiles | null> {
  if (process.platform === 'darwin') {
    return (
      decodeFilenamesPlist(await readText(rawFormat('NSFilenamesPboardType'))) ??
      decodeFileUrl(await readText(rawFormat('public.file-url'))) ??
      decodeUriList(await readText('text/uri-list'))
    )
  }
  return (
    decodeGnomeCopiedFiles(await readText(rawFormat('x-special/gnome-copied-files'))) ??
    decodeUriList(await readText('text/uri-list'))
  )
}
