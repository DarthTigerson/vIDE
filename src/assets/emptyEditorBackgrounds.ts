import vide from './emptyEditorBackground.png'
import clawd from './emptyEditorBackgroundClawd.png'
import atreus from './emptyEditorBackgroundAtreus.png'
import link from './emptyEditorBackgroundLink.png'
import type { BackgroundImage } from '@/stores/displayStore'

// Shared by EmptyEditorBackground.tsx and App.tsx's app-bg-badge — both
// render whichever image the 'none' | 'vide' | 'clawd' | 'atreus' | 'link'
// picker selects.
export const EMPTY_EDITOR_BACKGROUNDS: Record<Exclude<BackgroundImage, 'none'>, string> = {
  vide,
  clawd,
  atreus,
  link,
}
