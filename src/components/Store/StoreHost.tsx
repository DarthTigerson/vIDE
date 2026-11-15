import { useEffect } from 'react'
import { useStoreStore, findStoreApp, subscribeStoreOpen } from '@/stores/storeStore'
import { useEditorStore } from '@/stores/editorStore'
import { ConfirmActionModal } from '@/components/Git/ConfirmActionModal'
import { STORE_TAB_PATH, buildStoreAppPath } from '@/components/Settings/paths'
import { MovedAppsModal } from './MovedAppsModal'

// Mounted once in App.tsx. Owns the two Store things that start outside the
// Store tab: the "Install from file" confirm (palette, Settings and the Store
// header all start it), vide://store/<id> links and the moved-apps notice.
export function StoreHost() {
  const pending = useStoreStore((s) => s.pendingFile)
  const confirmFile = useStoreStore((s) => s.confirmFile)
  const cancelFile = useStoreStore((s) => s.cancelFile)
  const openRequest = useStoreStore((s) => s.openRequest)

  useEffect(() => subscribeStoreOpen(), [])

  useEffect(() => {
    if (!openRequest) return
    let cancelled = false
    void (async () => {
      const store = useStoreStore.getState()
      if (openRequest.id && !store.registry) await store.load(false)
      if (cancelled) return
      // An id the catalog does not know opens the Store tab instead.
      const known = openRequest.id !== null && !!findStoreApp(useStoreStore.getState().registry, openRequest.id)
      useEditorStore.getState().openTab({
        path: known ? buildStoreAppPath(openRequest.id!) : STORE_TAB_PATH,
        content: '',
        dirty: false,
      })
    })()
    return () => { cancelled = true }
  }, [openRequest])

  if (!pending) return <MovedAppsModal />
  const what = `${pending.name} ${pending.version} · runs code in vIDE. `
  const message = pending.matchesStore
    ? `${what}This package matches the Store release, so it will update from the Store like a normal install.`
    : `${what}This package isn't from the Store. It installs as "From file", with no checks and no updates. Only install packages you trust.`
  return (
    <>
    <MovedAppsModal />
    <ConfirmActionModal
      title={`Install ${pending.name} from a file?`}
      message={message}
      confirmLabel="Install"
      tone={pending.matchesStore ? 'accent' : 'danger'}
      onConfirm={() => void confirmFile()}
      onClose={cancelFile}
    />
    </>
  )
}
