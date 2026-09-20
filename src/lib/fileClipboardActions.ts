import { useFileClipboardStore } from '@/stores/fileClipboardStore'

export interface PasteResult {
  moved: { from: string; to: string }[]
  created: string[]
}

function samePaths(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((path, i) => path === b[i])
}

export async function copyToClipboard(path: string, mode: 'copy' | 'cut'): Promise<void> {
  await window.api.writeClipboardFiles([path], mode)
  useFileClipboardStore.getState().set([path], mode)
}

// Pastes whatever files are on the OS clipboard into targetDir. Moves when the
// clipboard is a pending cut (vIDE's own, or another app's on Linux); otherwise
// copies. Returns null when the clipboard holds no files.
export async function pasteInto(targetDir: string): Promise<PasteResult | null> {
  const clip = await window.api.readClipboardFiles()
  if (!clip || clip.paths.length === 0) return null

  const own = useFileClipboardStore.getState()
  const isCut = clip.mode === 'cut' || (own.mode === 'cut' && samePaths(own.paths, clip.paths))
  const result: PasteResult = { moved: [], created: [] }

  for (const source of clip.paths) {
    if (isCut) {
      const to = await window.api.moveInto(source, targetDir)
      if (to !== source) result.moved.push({ from: source, to })
    } else {
      result.created.push(await window.api.copyInto(source, targetDir))
    }
  }

  if (isCut && result.moved.length > 0) {
    // The cut sources no longer exist; leave the clipboard on the new paths as a
    // plain copy so a second paste duplicates instead of failing on a stale path.
    const newPaths = result.moved.map((m) => m.to)
    await window.api.writeClipboardFiles(newPaths, 'copy')
    useFileClipboardStore.getState().set(newPaths, 'copy')
  }
  return result
}

export async function dropExternalFiles(files: File[], targetDir: string): Promise<string[]> {
  const created: string[] = []
  for (const file of files) {
    const path = window.api.pathForFile(file)
    if (!path) continue
    created.push(await window.api.copyInto(path, targetDir))
  }
  return created
}
