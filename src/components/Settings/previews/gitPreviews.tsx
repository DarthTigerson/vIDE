import { useEditorSettingsStore } from '@/stores/editorSettingsStore'
import { useGitSettingsStore } from '@/stores/gitSettingsStore'
import { useGitRemoteUrlStore } from '@/stores/gitRemoteUrlStore'
import { useActiveRepo } from '@/stores/gitReposStore'
import { useFileStore } from '@/stores/fileStore'
import { useGeneralSettingsStore } from '@/stores/generalSettingsStore'
import { detectGitRemoteProvider, gitRemoteIcon, gitRemoteLabel } from '@/lib/gitRemoteProvider'
import { InlineDiffIcon } from '@/components/StatusBar/InlineDiffToggle'
import { PreviewFrame, MiniCode, MiniFooter, MiniTabs, MiniPanes } from './primitives'

// Live pictures for Settings › Git (VIDE-145). Each reads the same stores its
// block's controls write, so flipping a setting redraws its picture.

const BLAME_TEXT = 'Thomas, 2 days ago · Fixed sync auth'

export function BlamePreview() {
  const enabled = useEditorSettingsStore((s) => s.blameAnnotationsEnabled)
  const mode = useEditorSettingsStore((s) => s.blameDisplayMode)
  return (
    <PreviewFrame testId="blame-preview">
      <MiniCode lines={[
        { n: 41, segments: [{ text: 'const', token: 'keyword' }, { text: ' repo = useRepo()' }] },
        {
          n: 42,
          current: true,
          segments: [{ text: 'await', token: 'keyword' }, { text: ' repo.fetch()' }],
          trailing: enabled && mode === 'editor' ? <span className="pl-3 italic text-fg-subtle">{BLAME_TEXT}</span> : undefined,
        },
        { n: 43, segments: [{ text: 'render()' }] },
      ]} />
      <MiniFooter left="Ln 42, Col 7" right={enabled && mode === 'footer' ? BLAME_TEXT : null} />
    </PreviewFrame>
  )
}

// Uses the editor's own .git-* classes, so Custom colours and Strength show
// exactly as the editor would paint them. The deleted marker sits on the
// unchanged line above the gap and is never tinted.
export function InlineDiffPreview() {
  const enabled = useEditorSettingsStore((s) => s.inlineDiffEnabled)
  const footerIcon = useEditorSettingsStore((s) => s.inlineDiffFooterIcon)
  return (
    <PreviewFrame testId="inline-diff-preview">
      <MiniCode lines={[
        { n: 1, segments: [{ text: 'const', token: 'keyword' }, { text: ' retries = ' }, { text: '3', token: 'number' }] },
        {
          n: 2,
          numberClassName: 'git-gutter-modified',
          lineClassName: enabled ? 'git-line-modified' : '',
          segments: [{ text: 'const', token: 'keyword' }, { text: ' timeout = ' }, { text: '5000', token: 'number', className: enabled ? 'git-inline-diff-modified' : undefined }],
        },
        {
          n: 3,
          numberClassName: 'git-gutter-added',
          lineClassName: enabled ? 'git-line-added' : '',
          segments: [{ text: 'const', token: 'keyword' }, { text: ' backoff = ' }, { text: '2', token: 'number' }],
        },
        { n: 4, numberClassName: 'git-gutter-deleted', segments: [{ text: 'connect()' }] },
      ]} />
      <MiniFooter
        left="Ln 2, Col 18"
        right={footerIcon ? (
          <span
            data-testid="inline-diff-preview-icon"
            className="inline-grid h-4 w-4 place-items-center rounded-full border border-border [&_svg]:h-2.5 [&_svg]:w-2.5"
          >
            <InlineDiffIcon crossedOut={!enabled} />
          </span>
        ) : null}
      />
    </PreviewFrame>
  )
}

export function ForcePushPreview() {
  const enabled = useGitSettingsStore((s) => s.forceSafetyEnabled)
  const countdown = useGitSettingsStore((s) => s.countdownEnabled)
  const seconds = useGitSettingsStore((s) => s.countdownSeconds)
  const autoContinue = useGitSettingsStore((s) => s.autoContinueOnCountdownEnd)
  if (!enabled) {
    return (
      <PreviewFrame testId="force-push-preview" caption="Force push">
        <div className="px-2.5 py-2 font-mono text-[10.5px] leading-relaxed text-fg-muted">
          $ git push --force-with-lease
          <br />
          Runs straight away, no confirmation.
        </div>
      </PreviewFrame>
    )
  }
  const action = !countdown ? 'Force push' : autoContinue ? `Pushing in ${seconds}s` : `Confirm (${seconds})`
  return (
    <PreviewFrame testId="force-push-preview">
      <div className="m-3 rounded-md border border-border bg-popover px-3 py-2.5">
        <div className="text-xs font-semibold text-fg">Force push to origin/develop?</div>
        <p className="mb-2.5 mt-1 text-[11px] text-fg-muted">This overwrites the remote branch.</p>
        <div className="flex justify-end gap-1.5">
          <span className="rounded border border-border px-2 py-0.5 text-fg-muted">Cancel</span>
          <span className="rounded border border-red-600 bg-red-600 px-2 py-0.5 text-white">{action}</span>
        </div>
      </div>
    </PreviewFrame>
  )
}

export function GitLogPreview() {
  const always = useGitSettingsStore((s) => s.gitLogAutoShow) === 'always'
  return (
    <PreviewFrame testId="git-log-preview">
      <MiniTabs tabs={[{ label: 'Editor.tsx', active: !always }, { label: 'Git Log', active: always, dot: !always }]} />
      <div className="px-2.5 py-2 font-mono text-[10.5px] leading-relaxed text-fg-muted">
        {always ? (
          <>$ git pull<br />Already up to date.</>
        ) : (
          <>Stays behind your files.<br />Comes forward when a command fails.</>
        )}
      </div>
    </PreviewFrame>
  )
}

export function FetchPreview() {
  const enabled = useGitSettingsStore((s) => s.periodicFetchEnabled)
  const minutes = useGitSettingsStore((s) => s.periodicFetchIntervalMinutes)
  return (
    <PreviewFrame testId="fetch-preview" caption="Footer">
      <div className="mt-1.5">
        <MiniFooter
          left={`develop ↓${enabled ? 2 : '?'} ↑0`}
          right={enabled ? `fetched 3 min ago · every ${minutes} min` : 'fetch manually to update'}
        />
      </div>
    </PreviewFrame>
  )
}

export function GraphTabsPreview() {
  const biggest = useGeneralSettingsStore((s) => s.newTabPane) === 'biggest'
  const projectRoot = useFileStore((s) => s.projectRoot)
  const target = useGitSettingsStore((s) => (projectRoot ? s.getListDiffTargetBranch(projectRoot) : ''))
  const graph = { label: 'Graph', isNew: true }
  return (
    <PreviewFrame testId="graph-tabs-preview">
      <MiniPanes panes={[
        { id: 'focused', grow: 1, focused: true, tabs: [{ label: 'App.tsx' }, ...(biggest ? [] : [graph])] },
        { id: 'big', grow: 2, tabs: [{ label: 'Editor.tsx' }, ...(biggest ? [graph] : [])] },
      ]} />
      <MiniFooter left="List Diff" right={`feature → ${target || 'repo default'}`} />
    </PreviewFrame>
  )
}

export function RemotePreview() {
  const activeRepo = useActiveRepo()
  const url = useGitRemoteUrlStore((s) => (activeRepo ? s.urls[activeRepo] ?? '' : ''))
  const provider = detectGitRemoteProvider(url)
  return (
    <PreviewFrame testId="remote-preview" caption="Git panel">
      <div className="flex flex-col gap-0.5 px-2.5 py-1.5 font-mono text-[10.5px] text-fg-muted">
        <span>M src/App.tsx</span>
        <span>A src/lib/gitChangeColors.ts</span>
      </div>
      {url ? (
        <div className="mx-2.5 mb-2.5 flex items-center gap-2 rounded-md border border-border px-2 py-1 text-fg [&_svg]:h-3 [&_svg]:w-3">
          {gitRemoteIcon(provider)}
          <span className="flex-1">{gitRemoteLabel(provider)}</span>
          <span>↗</span>
        </div>
      ) : (
        <div className="px-2.5 pb-2.5 text-fg-subtle">{activeRepo ? 'This repo has no git remote.' : 'Open a repo to see its launcher.'}</div>
      )}
    </PreviewFrame>
  )
}
