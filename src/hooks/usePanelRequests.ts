import { useEffect, useRef } from 'react'
import { usePanelRequestStore, type RequestablePanel } from '@/stores/panelRequestStore'

// Applies panel requests (see panelRequestStore) to App's left-panel state.
// A request already sitting in the store when this mounts is history, not a
// pending action, so it's ignored.
export function usePanelRequests(setPanel: (panel: RequestablePanel) => void): void {
  const request = usePanelRequestStore((s) => s.request)
  const seen = useRef(request)

  useEffect(() => {
    if (request === seen.current) return
    seen.current = request
    if (request) setPanel(request.panel)
  }, [request, setPanel])
}
