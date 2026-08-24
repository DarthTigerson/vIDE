import { useDisplayStore } from '@/stores/displayStore'
import { EMPTY_EDITOR_BACKGROUNDS } from '@/assets/emptyEditorBackgrounds'

export function EmptyEditorBackground() {
  const backgroundImage = useDisplayStore((s) => s.backgroundImage)
  if (backgroundImage === 'none') return null
  return (
    <div
      className="absolute inset-0 empty-editor-bg pointer-events-none"
      style={{ backgroundImage: `url(${EMPTY_EDITOR_BACKGROUNDS[backgroundImage]})` }}
      aria-hidden="true"
    />
  )
}
