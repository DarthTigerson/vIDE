import { useEffect, useState } from 'react'
import { useGitSettingsStore } from '@/stores/gitSettingsStore'
import type { GitLogAutoShow } from '@/stores/gitSettingsStore'
import { useGitRemoteSettingsStore } from '@/stores/gitRemoteSettingsStore'
import { useFileStore } from '@/stores/fileStore'
import { Toggle } from '@/components/ui/Toggle'
import { Select } from '@/components/ui/Select'
import { Section, Row } from './SettingsLayout'

function Field({ id, label, value, onChange, placeholder }: {
  id: string; label: string; value: string; onChange: (v: string) => void; placeholder?: string
}) {
  return (
    <div className="mt-3 flex flex-col gap-1.5 max-w-md">
      <label htmlFor={id} className="text-sm text-fg">{label}</label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        className="h-8 px-2 text-sm text-fg bg-bg border border-border rounded-lg focus:outline-none focus:border-accent/60"
      />
    </div>
  )
}

export function GitSettingsPage() {
  const {
    forceSafetyEnabled, setForceSafetyEnabled,
    countdownEnabled, setCountdownEnabled,
    countdownSeconds, setCountdownSeconds,
    autoContinueOnCountdownEnd, setAutoContinueOnCountdownEnd,
    getListDiffTargetBranch, setListDiffTargetBranch,
    periodicFetchEnabled, setPeriodicFetchEnabled,
    periodicFetchIntervalMinutes, setPeriodicFetchIntervalMinutes,
    gitLogAutoShow, setGitLogAutoShow,
    repoScanDepth, setRepoScanDepth,
  } = useGitSettingsStore()
  const gitRemoteUrl = useGitRemoteSettingsStore((s) => s.externalUrl)
  const setGitRemoteUrl = useGitRemoteSettingsStore((s) => s.setExternalUrl)
  const gitRemoteProjectUrls = useGitRemoteSettingsStore((s) => s.projectUrls)
  const setGitRemoteProjectUrl = useGitRemoteSettingsStore((s) => s.setProjectUrl)
  const gitRemoteCloseSidePanelOnOpen = useGitRemoteSettingsStore((s) => s.closeSidePanelOnOpen)
  const setGitRemoteCloseSidePanelOnOpen = useGitRemoteSettingsStore((s) => s.setCloseSidePanelOnOpen)

  const projectRoot = useFileStore((s) => s.projectRoot)
  const [branches, setBranches] = useState<string[]>([])
  const [loadingBranches, setLoadingBranches] = useState(false)
  const listDiffTarget = projectRoot ? getListDiffTargetBranch(projectRoot) : ''

  useEffect(() => {
    if (!projectRoot) {
      setBranches([])
      return
    }
    let cancelled = false
    setLoadingBranches(true)
    window.api.gitBranches(projectRoot).then((result) => {
      if (cancelled) return
      setBranches(result)
      setLoadingBranches(false)
    })
    return () => {
      cancelled = true
    }
  }, [projectRoot])

  return (
    <div className="h-full overflow-auto p-6 bg-panel">
      <h1 className="text-base font-semibold text-fg mb-1">Git</h1>
      <p className="text-sm text-fg-muted mb-4">Safety settings and defaults for git operations.</p>

      <Section label="Force Push Safety">
        <Row>
          <Toggle
            className="max-w-[60ch]"
            label="Confirm before force-pushing"
            description="Show a confirmation modal before running force push or force push with lease."
            checked={forceSafetyEnabled}
            onChange={setForceSafetyEnabled}
          />

          {forceSafetyEnabled && (
            <div className="mt-3 pl-4 border-l border-border/40 flex flex-col gap-3">
              <Toggle
                className="max-w-[60ch]"
                label="Countdown before confirming"
                description="Show a countdown timer instead of an immediate Confirm button."
                checked={countdownEnabled}
                onChange={setCountdownEnabled}
              />

              {countdownEnabled && (
                <div className="pl-4 border-l border-border/40 flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <label htmlFor="countdown-duration" className="text-sm text-fg-muted shrink-0">Duration</label>
                    <input
                      id="countdown-duration"
                      type="number"
                      min={1}
                      max={30}
                      value={countdownSeconds}
                      onChange={(e) => setCountdownSeconds(Math.max(1, Math.min(30, parseInt(e.target.value, 10) || 1)))}
                      className="w-16 px-2 py-1 text-sm text-fg bg-bg border border-border rounded-lg focus:outline-none focus:border-accent/60"
                    />
                    <span className="text-sm text-fg-muted">seconds</span>
                  </div>

                  <Toggle
                    className="max-w-[60ch]"
                    label="Continue automatically when countdown ends"
                    description="The force push fires when the timer reaches zero, without requiring a Confirm click."
                    checked={autoContinueOnCountdownEnd}
                    onChange={setAutoContinueOnCountdownEnd}
                  />
                </div>
              )}
            </div>
          )}
        </Row>
      </Section>

      <Section label="Fetch">
        <Row>
          <Toggle
            className="max-w-[60ch]"
            label="Periodic background fetch"
            description="Silently fetch from the remote on an interval, on top of automatic fetches on repo open and branch switch. Keeps the ahead/behind counts in the footer accurate without a manual Fetch."
            checked={periodicFetchEnabled}
            onChange={setPeriodicFetchEnabled}
          />

          {periodicFetchEnabled && (
            <div className="mt-3 flex items-center gap-3">
              <label htmlFor="fetch-interval" className="text-sm text-fg-muted shrink-0">Fetch every</label>
              <input
                id="fetch-interval"
                type="number"
                min={1}
                max={120}
                value={periodicFetchIntervalMinutes}
                onChange={(e) => setPeriodicFetchIntervalMinutes(parseInt(e.target.value, 10) || 1)}
                className="w-16 px-2 py-1 text-sm text-fg bg-bg border border-border rounded-lg focus:outline-none focus:border-accent/60"
              />
              <span className="text-sm text-fg-muted">minutes</span>
            </div>
          )}
        </Row>
      </Section>

      <Section label="Multi-Repo">
        <Row>
          <p className="text-xs text-fg-muted max-w-[60ch]">
            How many folder levels below the opened project to scan for nested git repos.
            Scanning stops as soon as a repo is found, so a repo's own submodules aren't listed separately.
          </p>
          <div className="mt-3 flex items-center gap-3">
            <label htmlFor="repo-scan-depth" className="text-sm text-fg-muted shrink-0">Scan depth</label>
            <input
              id="repo-scan-depth"
              type="number"
              min={1}
              max={10}
              value={repoScanDepth}
              onChange={(e) => setRepoScanDepth(parseInt(e.target.value, 10) || 1)}
              className="w-16 px-2 py-1 text-sm text-fg bg-bg border border-border rounded-lg focus:outline-none focus:border-accent/60"
            />
            <span className="text-sm text-fg-muted">levels</span>
          </div>
        </Row>
      </Section>

      <Section label="Git Log">
        <Row>
          <p className="text-xs text-fg-muted max-w-[60ch]">
            Every fetch/pull/push/commit/checkout runs in the read-only Git Log terminal.
            Choose whether it jumps to the front each time or only when a command fails.
          </p>
          <div className="mt-3 max-w-xs">
            <label htmlFor="git-log-auto-show" className="text-xs text-fg-muted mb-1.5 block">
              Show Git Log terminal
            </label>
            <Select
              id="git-log-auto-show"
              value={gitLogAutoShow}
              onChange={(v) => setGitLogAutoShow(v as GitLogAutoShow)}
              options={[
                { value: 'always', label: 'Every time a command runs' },
                { value: 'onError', label: 'Only when a command fails' },
              ]}
            />
          </div>
        </Row>
      </Section>

      <Section label="List Diff">
        <Row>
          {!projectRoot ? (
            <p className="text-sm text-fg-muted">Open a repo to set its default target branch.</p>
          ) : (
            <div className="max-w-xs">
              <label htmlFor="list-diff-target-branch" className="text-xs text-fg-muted mb-1.5 block">
                Default target branch
              </label>
              <Select
                id="list-diff-target-branch"
                value={listDiffTarget}
                disabled={loadingBranches}
                onChange={(v) => setListDiffTargetBranch(projectRoot, v)}
                options={[
                  { value: '', label: 'Use repo default' },
                  ...branches.map((branch) => ({ value: branch, label: branch })),
                ]}
              />
              <p className="text-xs text-fg-subtle mt-1.5">
                Used to compare against the current branch when opening List Diff. Leave as "Use repo default" to fall back to git's own default branch.
              </p>
            </div>
          )}
        </Row>
      </Section>

      <Section label="Git Remote">
        <Row>
          <p className="text-xs text-fg-muted max-w-[60ch]">
            Point this at your repo's page on GitHub, GitLab, or Bitbucket and a
            matching launcher button appears at the bottom of the Git panel.
          </p>

          <Field
            id="git-remote-external-url"
            label="Default URL"
            value={gitRemoteUrl}
            onChange={setGitRemoteUrl}
            placeholder="https://github.com/your-org/your-repo"
          />

          {projectRoot && (
            <Field
              id="git-remote-project-url"
              label="This project's URL"
              value={gitRemoteProjectUrls[projectRoot] ?? ''}
              onChange={(v) => setGitRemoteProjectUrl(projectRoot, v)}
              placeholder={gitRemoteUrl || 'Same as default URL above'}
            />
          )}

          <div className="mt-3">
            <Toggle
              className="max-w-[60ch]"
              label="Close side panel when opening"
              description="Collapse the currently open sidebar (Files, Git, etc.) when jumping to the repo browser tab, to give it the full width."
              checked={gitRemoteCloseSidePanelOnOpen}
              onChange={setGitRemoteCloseSidePanelOnOpen}
            />
          </div>
        </Row>
      </Section>
    </div>
  )
}
