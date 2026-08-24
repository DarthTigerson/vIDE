import vide from './emptyEditorBackground.png'
import clawd from './emptyEditorBackgroundClawd.png'
import type { BackgroundImage } from '@/stores/displayStore'

// Shared by EmptyEditorBackground.tsx and App.tsx's app-bg-badge — both
// render whichever image the 'none' | 'vide' | 'clawd' picker selects.
export const EMPTY_EDITOR_BACKGROUNDS: Record<Exclude<BackgroundImage, 'none'>, string> = {
  vide,
  clawd,
}
