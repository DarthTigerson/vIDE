import { useEffect, useState } from 'react'
import { formatMemory } from '@/lib/memoryBreakdown'
import { SettingRow } from './FeatureBlock'

export interface ToolInstallInfo { path: string | null; source: 'system' | 'vide' | null; downloadBytes: number | null }

const primaryButton = 'shrink-0 whitespace-nowrap rounded-lg bg-accent px-3.5 py-1.5 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:opacity-40'

// Where a CLI vIDE drives comes from (llama.cpp, graphify): the user's own
// install if there is one, else one click puts it in place, so nobody needs
// Homebrew or a terminal. A download reports a percent; a step without one
// (uv installing graphify) just shows "Installing…".
export function ToolInstallRow({ name, notInstalled, getInstall, install, onProgress, onInstalled }: {
  name: string
  notInstalled: string
  getInstall: () => Promise<ToolInstallInfo>
  install: () => Promise<{ ok: true; path: string } | { ok: false; error: string }>
  onProgress: (cb: (received: number, total: number) => void) => () => void
  onInstalled: () => void
}) {
  const [info, setInfo] = useState<ToolInstallInfo | null>(null)
  const [installing, setInstalling] = useState(false)
  const [percent, setPercent] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getInstall().then(setInfo).catch(() => {})
  }, [getInstall])

  const run = async () => {
    setError(null)
    setInstalling(true)
    const unsubscribe = onProgress((received, total) => {
      setPercent(total > 0 && received < total ? Math.floor((received / total) * 100) : null)
    })
    try {
      const result = await install()
      if (result.ok) {
        setInfo(await getInstall())
        onInstalled()
      } else {
        setError(result.error)
      }
    } finally {
      unsubscribe()
      setInstalling(false)
      setPercent(null)
    }
  }

  if (!info) return null

  if (info.path) {
    return (
      // Stacked: the path is far wider than the row, and beside the label it
      // squeezed "Installed by vIDE." into one word per line.
      <SettingRow label={name} description={info.source === 'vide' ? 'Installed by vIDE.' : 'Found on this machine.'} stacked>
        <span className="block break-all font-mono text-xs text-fg-subtle">{info.path}</span>
      </SettingRow>
    )
  }

  const size = info.downloadBytes ? ` (${formatMemory(info.downloadBytes)})` : ''
  return (
    <SettingRow label={name} description={error ?? notInstalled}>
      {installing
        ? <button type="button" className={primaryButton} disabled>{percent !== null ? `Installing… ${percent}%` : 'Installing…'}</button>
        : <button type="button" className={primaryButton} onClick={run}>{error ? 'Retry' : `Install ${name}${size}`}</button>}
    </SettingRow>
  )
}
