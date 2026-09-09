import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { useBrowserRecentStore } from '@/stores/browserRecentStore'
import { useBrowserClosedTabsStore } from '@/stores/browserClosedTabsStore'
import { useStatusMessageStore } from '@/stores/statusMessageStore'

interface Props {
  browserId: string
  onClose: () => void
}

export function ClearBrowsingDataModal({ browserId, onClose }: Props) {
  const [clearCache, setClearCache] = useState(true)
  const [clearCookies, setClearCookies] = useState(true)
  const [clearHistory, setClearHistory] = useState(true)
  const [clearing, setClearing] = useState(false)

  const nothingSelected = !clearCache && !clearCookies && !clearHistory

  async function handleClear() {
    setClearing(true)
    try {
      if (clearCache) await window.api.browserViewClearCache(browserId)
      if (clearCookies) await window.api.browserViewClearCookies(browserId)
      if (clearHistory) {
        useBrowserRecentStore.getState().clear()
        useBrowserClosedTabsStore.getState().clear()
      }
    } finally {
      setClearing(false)
    }
    const cleared = [clearCache && 'cache', clearCookies && 'cookies', clearHistory && 'history'].filter(Boolean)
    useStatusMessageStore.getState().show(`Cleared ${cleared.join(', ')}`)
    onClose()
  }

  return (
    <Modal onClose={onClose}>
      <h2 className="text-sm font-semibold text-fg mb-1">Clear browsing data</h2>
      <p className="text-sm text-fg-muted mb-4">Choose what to clear for this browser.</p>
      <div className="flex flex-col gap-2 mb-5">
        <label className="flex items-center gap-2 text-sm text-fg">
          <input type="checkbox" checked={clearCache} onChange={(e) => setClearCache(e.target.checked)} />
          Cache
        </label>
        <label className="flex items-center gap-2 text-sm text-fg">
          <input type="checkbox" checked={clearCookies} onChange={(e) => setClearCookies(e.target.checked)} />
          Cookies
        </label>
        <label className="flex items-center gap-2 text-sm text-fg">
          <input type="checkbox" checked={clearHistory} onChange={(e) => setClearHistory(e.target.checked)} />
          History
        </label>
      </div>
      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          disabled={clearing}
          className="px-4 py-1.5 text-sm rounded-lg border border-border text-fg-muted hover:text-fg hover:border-fg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleClear}
          disabled={clearing || nothingSelected}
          aria-busy={clearing}
          className="px-4 py-1.5 text-sm rounded-lg bg-accent text-on-accent font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Clear
        </button>
      </div>
    </Modal>
  )
}
