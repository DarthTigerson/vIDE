import { useCallback } from 'react'
import { StreamTerminal } from '@/apps/StreamTerminal'

// A container's `docker logs -f` output in a read-only terminal.
// `zoomKey` is what the per-tab Cmd+=/-/0 font size is stored under.
export function DockerLogTerminal({ containerId, zoomKey }: { containerId: string; zoomKey: string }) {
  const start = useCallback((write: (chunk: string) => void) => {
    const streamId = `docker-logs-${containerId}-${Date.now().toString(36)}`
    let streaming = true
    window.api.dockerRunLogs(streamId, containerId)
    const offData = window.api.onDockerLogData((id, data) => {
      if (id === streamId) write(data)
    })
    const offExit = window.api.onDockerLogExit((id) => {
      if (id === streamId) streaming = false
    })
    return () => {
      offData()
      offExit()
      if (streaming) window.api.dockerStopLogs(streamId)
    }
  }, [containerId])

  return <StreamTerminal start={start} streamKey={containerId} zoomKey={zoomKey} placeholder="Waiting for output…" />
}
