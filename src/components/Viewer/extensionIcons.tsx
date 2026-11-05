import type { ReactNode } from 'react'
import type { ExtensionId } from '@/lib/extensions'

export function ImageViewerIcon() {
  return (
    <svg width="1.5rem" height="1.5rem" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="5" width="16" height="14" rx="2" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="9" cy="10" r="1.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M4.5 17l4.5-4.5 3 3 3-3.5 4.5 5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    </svg>
  )
}

export const EXTENSION_ICONS: Record<ExtensionId, ReactNode> = {
  'image-viewer': <ImageViewerIcon />,
}
