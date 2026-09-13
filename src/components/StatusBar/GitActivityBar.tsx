import { useEffect, useRef, useState } from 'react'
import { useRepoGitState } from '@/stores/gitStore'
import { useGitReposStore } from '@/stores/gitReposStore'

// Matches the `git-activity-growth` keyframes duration in index.css — a run
// shorter than one full cycle still plays it out completely so a fast
// command (most git commands) doesn't just flicker unnoticed.
const RUN_ANIMATION_MS = 1350
const ERROR_FLASH_MS = 1200

export function GitActivityBar() {
  const selectedRepo = useGitReposStore((s) => s.selectedRepo)
  const { commandStatus, commandError } = useRepoGitState(selectedRepo)

  const [visibleRunning, setVisibleRunning] = useState(false)
  const runStartedAt = useRef(0)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [flashing, setFlashing] = useState(false)
  const prevError = useRef<{ repo: string | null; count: number } | null>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (commandStatus === 'running') {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current)
        hideTimer.current = null
      }
      runStartedAt.current = Date.now()
      setVisibleRunning(true)
      return
    }

    if (!visibleRunning) return
    const elapsed = Date.now() - runStartedAt.current
    const remaining = Math.max(0, RUN_ANIMATION_MS - elapsed)
    hideTimer.current = setTimeout(() => setVisibleRunning(false), remaining)
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commandStatus])

  useEffect(() => {
    const prev = prevError.current
    prevError.current = { repo: selectedRepo, count: commandError }
    if (!prev || prev.repo !== selectedRepo || commandError <= prev.count) return

    // A failure ends the run outright — don't let a leftover running-bar
    // tail reappear once the flash finishes.
    if (hideTimer.current) {
      clearTimeout(hideTimer.current)
      hideTimer.current = null
    }
    setVisibleRunning(false)

    if (flashTimer.current) clearTimeout(flashTimer.current)
    setFlashing(true)
    flashTimer.current = setTimeout(() => setFlashing(false), ERROR_FLASH_MS)
    return () => {
      if (flashTimer.current) clearTimeout(flashTimer.current)
    }
  }, [selectedRepo, commandError])

  if (flashing) {
    return <div data-testid="git-activity-bar" className="git-activity-bar git-activity-bar-error" />
  }

  if (visibleRunning) {
    return <div data-testid="git-activity-bar" className="git-activity-bar git-activity-bar-running" />
  }

  return null
}
