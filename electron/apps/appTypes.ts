// Renderer-visible shapes of store apps. Type-only so src/ can import it.

import type { AppContributes } from './appManifest'

export type { AppContributes }
export type AppStatus = 'loaded' | 'failed' | 'restart-required' | 'disabled'

export interface AppInfo {
  id: string
  name: string
  version: string
  // 'file' = installed from a package file that is not a Store release.
  source: 'store' | 'dev' | 'file'
  rendererUrl: string
  // vide-app:// URL of the manifest's `style`, versioned like rendererUrl.
  styleUrl?: string
  hasMain: boolean
  icon?: string
  contributes: AppContributes
  status: AppStatus
  error?: string
}
