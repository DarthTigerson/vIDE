import { isImageFile } from './fileKinds'
import { IMAGE_VIEWER_SETTINGS_TAB_PATH } from '@/components/Settings/paths'

export type ExtensionId = 'image-viewer'

// An extension only changes how matching files open: it has no sidebar panel
// and never appears on the activity bar, just in All Apps and Settings.
export interface ExtensionDef {
  id: ExtensionId
  title: string
  description: string
  settingsPath: string
  handles: (fileName: string) => boolean
}

export const EXTENSIONS: ExtensionDef[] = [
  {
    id: 'image-viewer',
    title: 'Image viewer',
    description: 'Opens PNG, JPEG, GIF, BMP, WebP, AVIF, ICO, SVG, TIFF and HEIC files as pictures.',
    settingsPath: IMAGE_VIEWER_SETTINGS_TAB_PATH,
    handles: isImageFile,
  },
]

export function getExtension(id: ExtensionId): ExtensionDef {
  return EXTENSIONS.find((e) => e.id === id)!
}

// The extension that handles this file, or null for a file no extension owns.
export function extensionForFile(fileName: string): ExtensionDef | null {
  return EXTENSIONS.find((e) => e.handles(fileName)) ?? null
}
