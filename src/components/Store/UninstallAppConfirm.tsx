import { ConfirmActionModal } from '@/components/Git/ConfirmActionModal'
import { useStoreStore } from '@/stores/storeStore'

// The one "Uninstall X?" confirm for a store app, shared by the Store row,
// its right-click menu and the app page.
export function UninstallAppConfirm({ appId, name, onClose }: { appId: string; name: string; onClose: () => void }) {
  const uninstall = useStoreStore((s) => s.uninstall)
  return (
    <ConfirmActionModal
      title={`Uninstall ${name}?`}
      message="Its settings stay, so reinstalling brings them back."
      confirmLabel="Uninstall"
      onConfirm={() => void uninstall(appId)}
      onClose={onClose}
    />
  )
}
