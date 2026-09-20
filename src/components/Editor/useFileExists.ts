import { useEffect, useState } from 'react'

// Whether `path` currently exists on disk. False until confirmed, so callers
// that hide things for a missing file never flash them for one that's gone.
// Pass a changing `refreshKey` to re-check (e.g. on file-system events).
export function useFileExists(path: string | null, refreshKey?: unknown): boolean {
  const [exists, setExists] = useState(false)

  useEffect(() => {
    if (!path) {
      setExists(false)
      return
    }
    let cancelled = false
    window.api
      .pathExists(path)
      .then((value) => { if (!cancelled) setExists(value) })
      .catch(() => { if (!cancelled) setExists(false) })
    return () => { cancelled = true }
  }, [path, refreshKey])

  return exists
}
