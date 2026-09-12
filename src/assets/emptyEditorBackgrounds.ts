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
}
