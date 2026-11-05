import { getExtension, type ExtensionId } from '@/lib/extensions'
import { openFile } from '@/lib/openFile'
import { useEditorStore } from '@/stores/editorStore'
import { useExtensionsStore } from '@/stores/extensionsStore'
import { buildExtensionOffPath } from './paths'

// Shown instead of a viewer when its extension is off, so a file never lands
// in the text editor by surprise (a binary image would be garbage there).
export function ExtensionOffNotice({ extensionId, path }: { extensionId: ExtensionId; path: string }) {
  const extension = getExtension(extensionId)
  const name = path.split('/').pop() ?? path
  const noticePath = buildExtensionOffPath(extensionId, path)

  async function enable() {
    useExtensionsStore.getState().setEnabled(extensionId, true)
    await openFile(path)
    useEditorStore.getState().closeTabEverywhere(noticePath)
  }

  return (
    <div className="h-full flex flex-col items-center justify-center gap-3 bg-panel p-6 text-center">
      <h1 className="text-base font-semibold text-fg">{extension.title} is turned off</h1>
      <p className="max-w-[52ch] text-sm text-fg-muted">
        Turn it on to open <span className="font-mono">{name}</span>.
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void enable()}
          className="h-7 px-3 rounded bg-accent text-on-accent text-xs font-medium hover:opacity-90"
        >
          Enable
        </button>
      </div>
    </div>
  )
}
