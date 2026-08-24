import { create } from 'zustand'

// Set by updateStore.restart() right before the app relaunches, so it
// survives the process restart via localStorage. Read and cleared exactly
// once on the next startup — clearing happens immediately on read, before
// the fetch below, so a failed fetch can never cause a second attempt.
export const PENDING_CHANGELOG_KEY = 'vide:pendingChangelogVersion'

interface ChangelogState {
  version: string | null
  content: string | null
  checkPending: () => Promise<void>
  dismiss: () => void
}

export const useChangelogStore = create<ChangelogState>((set) => ({
  version: null,
  content: null,

  checkPending: async () => {
    const version = localStorage.getItem(PENDING_CHANGELOG_KEY)
    if (!version) return
    localStorage.removeItem(PENDING_CHANGELOG_KEY)

    const content = await window.api.getChangelogForVersion(version)
    if (content) set({ version, content })
  },

  dismiss: () => set({ version: null, content: null }),
}))
