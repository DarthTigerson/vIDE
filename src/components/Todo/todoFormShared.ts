import { extractPastedImageFiles, readFileAsDataUrl } from '@/lib/attachmentPaste'

export const inputClass =
  'bg-panel border border-border rounded px-2 py-1.5 text-sm text-fg focus:outline-none focus:border-accent'

export async function uploadPastedImages(
  clipboardData: DataTransfer | null,
  saveAttachment: (dataUrl: string) => Promise<string>
): Promise<string[]> {
  const files = extractPastedImageFiles(clipboardData)
  if (files.length === 0) return []
  const dataUrls = await Promise.all(files.map(readFileAsDataUrl))
  return Promise.all(dataUrls.map((dataUrl) => saveAttachment(dataUrl)))
}
