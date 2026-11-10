import vide from './emptyEditorBackground.png'
import clawd from './emptyEditorBackgroundClawd.png'
import atreus from './emptyEditorBackgroundAtreus.png'
import link from './emptyEditorBackgroundLink.png'
import techLines from './emptyEditorBackgroundTechLines.png'
import borahae from './emptyEditorBackgroundBorahae.png'
import wave from './emptyEditorBackgroundWave.png'
import gabriele from './emptyEditorBackgroundGabriele.png'
import rockhoppers from './emptyEditorBackgroundRockhoppers.png'
import goodGirl from './emptyEditorBackgroundGoodGirl.png'
import malta from './emptyEditorBackgroundMalta.jpg'
import type { CSSProperties } from 'react'
import type { BackgroundImage } from '@/stores/displayStore'

// Shared by EmptyEditorBackground.tsx and App.tsx's app-bg-badge — both
// render whichever image the BackgroundImage picker selects.
export const EMPTY_EDITOR_BACKGROUNDS: Record<Exclude<BackgroundImage, 'none'>, string> = {
  vide,
  clawd,
  atreus,
  link,
  techLines,
  borahae,
  wave,
  gabriele,
  rockhoppers,
  goodGirl,
  malta,
}

// Every other background is a cut-out badge pinned to the right edge at full
// height (the .empty-editor-bg / .app-bg-badge defaults). Full-scene images —
// a whole wallpaper rather than a badge — fill the area instead, so they
// don't leave a hard edge on wide windows.
const FULL_SCENE: ReadonlySet<BackgroundImage> = new Set<BackgroundImage>(['malta'])

export function backgroundImageStyle(image: Exclude<BackgroundImage, 'none'>): CSSProperties {
  const url = `url(${EMPTY_EDITOR_BACKGROUNDS[image]})`
  return FULL_SCENE.has(image)
    ? { backgroundImage: url, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { backgroundImage: url }
}
