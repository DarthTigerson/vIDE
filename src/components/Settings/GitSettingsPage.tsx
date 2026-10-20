import { useEffect, useState } from 'react'
import { useGitSettingsStore } from '@/stores/gitSettingsStore'
import type { GitLogAutoShow } from '@/stores/gitSettingsStore'
import { useGitRemoteSettingsStore } from '@/stores/gitRemoteSettingsStore'
import { useFileStore } from '@/stores/fileStore'
import { useEditorSettingsStore, type BlameDisplayMode } from '@/stores/editorSettingsStore'
import { Switch } from '@/components/ui/Toggle'
import { RadioGroup } from '@/components/ui/RadioGroup'
import { ColorPickerRow } from '@/components/ui/ColorPickerRow'
import type { ChangeColorMode, ChangeStrength } from '@/lib/gitChangeColors'
import { Select } from '@/components/ui/Select'
import { TextField } from './SettingsLayout'
import { FeatureBlock, SettingRow, NumberInput } from './FeatureBlock'
import { ToolFolderRows } from './HiddenFolderControls'
import {
  BlamePreview, InlineDiffPreview, ForcePushPreview, GitLogPreview, FetchPreview, GraphTabsPreview, RemotePreview,
} from './previews/gitPreviews'

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
  const blameAnnotationsEnabled = useEditorSettingsStore((s) => s.blameAnnotationsEnabled)
  const setBlameAnnotationsEnabled = useEditorSettingsStore((s) => s.setBlameAnnotationsEnabled)
  const blameDisplayMode = useEditorSettingsStore((s) => s.blameDisplayMode)
  const setBlameDisplayMode = useEditorSettingsStore((s) => s.setBlameDisplayMode)
  const inlineDiffEnabled = useEditorSettingsStore((s) => s.inlineDiffEnabled)
  const setInlineDiffEnabled = useEditorSettingsStore((s) => s.setInlineDiffEnabled)
  const inlineDiffColors = useEditorSettingsStore((s) => s.inlineDiffColors)
  const setInlineDiffColors = useEditorSettingsStore((s) => s.setInlineDiffColors)
  const inlineDiffCustomColors = useEditorSettingsStore((s) => s.inlineDiffCustomColors)
  const setInlineDiffCustomColor = useEditorSettingsStore((s) => s.setInlineDiffCustomColor)
  const inlineDiffStrength = useEditorSettingsStore((s) => s.inlineDiffStrength)
  const setInlineDiffStrength = useEditorSettingsStore((s) => s.setInlineDiffStrength)
  const inlineDiffFooterIcon = useEditorSettingsStore((s) => s.inlineDiffFooterIcon)
  const setInlineDiffFooterIcon = useEditorSettingsStore((s) => s.setInlineDiffFooterIcon)

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
    <div className="h-full overflow-auto bg-panel p-6">
      <div className="max-w-[1000px]">
        <h1 className="mb-1 text-base font-semibold text-fg">Git</h1>
        <p className="mb-4 text-sm text-fg-muted">How git behaves in vIDE.</p>

        <FeatureBlock
          title="Blame"
          description="Who last changed the line you're on, and why."
          toggle={{ checked: blameAnnotationsEnabled, onChange: setBlameAnnotationsEnabled }}
          preview={<BlamePreview />}
        >
          <SettingRow label="Show blame in" htmlFor="blame-display-mode">
            <div className="w-56">
              <Select
                id="blame-display-mode"
                value={blameDisplayMode}
                onChange={(v) => setBlameDisplayMode(v as BlameDisplayMode)}
                options={[
                  { value: 'footer', label: 'Footer' },
                  { value: 'editor', label: 'Editor (end of current line)' },
                ]}
              />
            </div>
          </SettingRow>
        </FeatureBlock>

        <FeatureBlock
          title="Inline diff"
          description="See what you changed since the last commit, down to the word. The gutter markers stay on either way."
          toggle={{ checked: inlineDiffEnabled, onChange: setInlineDiffEnabled }}
          dimWhenOff={false}
          preview={<InlineDiffPreview />}
        >
          <SettingRow label="Show icon in footer">
            <Switch label="Show icon in footer" checked={inlineDiffFooterIcon} onChange={setInlineDiffFooterIcon} />
          </SettingRow>
          <SettingRow label="Change colours" description="Also used by the gutter line numbers.">
            <RadioGroup<ChangeColorMode>
              ariaLabel="Change colours"
              value={inlineDiffColors}
              onChange={setInlineDiffColors}
              options={[
                { value: 'default', label: 'Default' },
                { value: 'custom', label: 'Custom' },
              ]}
            />
          </SettingRow>
          {inlineDiffColors === 'custom' && (
            <div className="flex max-w-[460px] flex-col pl-4">
              <ColorPickerRow label="Added" value={inlineDiffCustomColors.added} onChange={(hex) => setInlineDiffCustomColor('added', hex)} />
              <ColorPickerRow label="Modified" value={inlineDiffCustomColors.modified} onChange={(hex) => setInlineDiffCustomColor('modified', hex)} />
              <ColorPickerRow label="Deleted" value={inlineDiffCustomColors.deleted} onChange={(hex) => setInlineDiffCustomColor('deleted', hex)} />
            </div>
          )}
          <SettingRow label="Strength">
            <RadioGroup<ChangeStrength>
              ariaLabel="Inline diff strength"
              value={inlineDiffStrength}
              onChange={setInlineDiffStrength}
              options={[
                { value: 'subtle', label: 'Subtle' },
                { value: 'medium', label: 'Medium' },
                { value: 'strong', label: 'Strong' },
              ]}
            />
          </SettingRow>
        </FeatureBlock>

        <FeatureBlock
          title="Force push safety"
          description="A pause before you overwrite the remote branch."
          toggle={{ checked: forceSafetyEnabled, onChange: setForceSafetyEnabled }}
          preview={<ForcePushPreview />}
        >
          <SettingRow label="Countdown before confirming">
            <Switch label="Countdown before confirming" checked={countdownEnabled} onChange={setCountdownEnabled} />
          </SettingRow>
          <fieldset disabled={!countdownEnabled} className={['m-0 min-w-0 border-0 p-0', countdownEnabled ? '' : 'opacity-50'].join(' ')}>
            <SettingRow label="Countdown length" htmlFor="countdown-duration" sub>
              <NumberInput id="countdown-duration" label="Countdown length" value={countdownSeconds} min={1} max={30} unit="seconds" onChange={setCountdownSeconds} />
            </SettingRow>
            <SettingRow label="Push when the countdown ends" sub>
              <Switch label="Push when the countdown ends" checked={autoContinueOnCountdownEnd} onChange={setAutoContinueOnCountdownEnd} />
            </SettingRow>
          </fieldset>
        </FeatureBlock>

        <FeatureBlock
          title="Git Log"
          description="Every fetch, pull, push, commit and checkout runs in the read-only Git Log terminal."
          preview={<GitLogPreview />}
        >
          <SettingRow label="Bring it forward" htmlFor="git-log-auto-show">
            <div className="w-56">
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
          </SettingRow>
        </FeatureBlock>

        <FeatureBlock
          title="Background fetch"
          description="Fetch quietly on a timer, so the footer's ahead/behind counts stay accurate."
          toggle={{ checked: periodicFetchEnabled, onChange: setPeriodicFetchEnabled }}
          preview={<FetchPreview />}
        >
          <SettingRow label="Fetch every" htmlFor="fetch-interval" sub>
            <NumberInput id="fetch-interval" label="Fetch every" value={periodicFetchIntervalMinutes} min={1} max={120} unit="minutes" onChange={setPeriodicFetchIntervalMinutes} />
          </SettingRow>
        </FeatureBlock>

        <FeatureBlock
          title="Multi-repo"
          description="How many folder levels below the project to look for nested repos. Stops at the first repo found, so submodules aren't listed separately."
        >
          <SettingRow label="Scan depth" htmlFor="repo-scan-depth">
            <NumberInput id="repo-scan-depth" label="Scan depth" value={repoScanDepth} min={1} max={10} unit="levels" onChange={setRepoScanDepth} />
          </SettingRow>
        </FeatureBlock>

        <FeatureBlock
          title="Graph & List Diff"
          description="What List Diff compares the current branch against. Where the tabs open follows General › Open new tabs in."
          preview={<GraphTabsPreview />}
        >
          {projectRoot ? (
            <SettingRow label="Default target branch" htmlFor="list-diff-target-branch">
              <div className="w-56">
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
              </div>
            </SettingRow>
          ) : (
            <p className="py-1.5 text-sm text-fg-muted">Open a repo to set its default target branch.</p>
          )}
        </FeatureBlock>

        <FeatureBlock
          title="Remote launcher"
          description="A button at the bottom of the Git panel that opens your repo's page on GitHub, GitLab or Bitbucket."
          preview={<RemotePreview />}
        >
          <TextField
            id="git-remote-external-url"
            label="Default URL"
            value={gitRemoteUrl}
            onChange={setGitRemoteUrl}
            placeholder="https://github.com/your-org/your-repo"
            className="flex max-w-[460px] flex-col gap-1.5 py-1.5"
          />
          {projectRoot && (
            <TextField
              id="git-remote-project-url"
              label="This project's URL"
              value={gitRemoteProjectUrls[projectRoot] ?? ''}
              onChange={(v) => setGitRemoteProjectUrl(projectRoot, v)}
              placeholder={gitRemoteUrl || 'Same as default URL above'}
              className="flex max-w-[460px] flex-col gap-1.5 py-1.5"
            />
          )}
          <SettingRow label="Close side panel when opening" description="Give the repo page the full width.">
            <Switch label="Close side panel when opening" checked={gitRemoteCloseSidePanelOnOpen} onChange={setGitRemoteCloseSidePanelOnOpen} />
          </SettingRow>
        </FeatureBlock>

        <FeatureBlock
          title=".git folder"
          description="Git keeps the repository's data in .git at the project root. It can't be gitignored, but you can hide it from the file tree."
        >
          <ToolFolderRows name=".git" />
        </FeatureBlock>
      </div>
    </div>
  )
}
