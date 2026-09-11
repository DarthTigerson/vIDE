import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { MouseEvent, ReactNode } from 'react'
import type { GitFileEntry } from '@/types/index'
import { useGitStore, useRepoGitState } from '@/stores/gitStore'
import { useEditorStore } from '@/stores/editorStore'
import { useGitGraphStore } from '@/stores/gitGraphStore'
import { buildGitDiffPath } from './paths'
import { GIT_BRANCH_DIFF_TAB_PATH, GIT_GRAPH_TAB_PATH } from '@/components/Settings/paths'
import { Modal } from '@/components/ui/Modal'
import { clampToViewport } from '@/components/ui/clampToViewport'
import { useSearchStore } from '@/stores/searchStore'
import { FileRow } from './FileRow'
import { ConfirmForcePushModal } from './ConfirmForcePushModal'
import { useForcePushConfirm } from './useForcePushConfirm'
import { useCommitMessageSettingsStore } from '@/stores/commitMessageSettingsStore'
import { FilesIcon, ClaudeIcon } from '@/components/ActivityBar/ActivityBar'
import { ContextMenuButton, ContextMenuDivider } from './ContextMenu'
import { pickClaudeGif } from '@/assets/claudeGifs'
import { useGitReposStore } from '@/stores/gitReposStore'
import { useGitExpandedReposStore } from '@/stores/gitExpandedReposStore'
import { useGitOpenReposStore } from '@/stores/gitOpenReposStore'
import { useSidebarUiStore } from '@/stores/sidebarUiStore'

// Solid fill matching the Commit button's active look — every action pill in
// the Git panel (Branch, Fetch, Pull, Push, Graph, List Diff) shares this
// now, instead of each having its own translucent-gradient-and-ring style.
const accentSolidColor = 'bg-accent/80 text-on-accent hover:bg-accent'

const pillButtonClass =
  `w-full h-7 rounded-full flex items-center justify-center text-[0.625rem] font-bold tracking-tight transition-colors active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${accentSolidColor}`

interface ContextMenuState {
  x: number
  y: number
  file: GitFileEntry
  staged: boolean
}

function CloseRepoIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function DiscardAllIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
      <path d="M4 7h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

// A single seamless pill: the main action fills most of the width, a
// divider-separated chevron segment on the right opens a full-width options
// panel underneath (or above, via `direction`, for triggers near the bottom
// of the panel — e.g. a future Push variant — that don't have room below).
function SplitCommandButton({
  label,
  onClick,
  disabled,
  colorClassName,
  open,
  onToggleOptions,
  onCloseOptions,
  direction,
  children,
  optionsChildren,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  colorClassName: string
  open: boolean
  onToggleOptions: () => void
  onCloseOptions: () => void
  direction: 'down' | 'up'
  children: ReactNode
  optionsChildren: ReactNode
}) {
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) onCloseOptions()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return (
    <div ref={rootRef} className="relative flex-1 min-w-0">
      <div className={['flex h-7 rounded-full overflow-hidden transition-colors', colorClassName].join(' ')}>
        <button
          type="button"
          disabled={disabled}
          onClick={onClick}
          className="flex-1 min-w-0 flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {children}
        </button>
        <button
          type="button"
          aria-label={`${label} options`}
          aria-haspopup="true"
          aria-expanded={open}
          disabled={disabled}
          onClick={onToggleOptions}
          className="w-7 shrink-0 flex items-center justify-center border-l border-black/15 transition-colors hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" className={direction === 'up' ? 'rotate-180' : ''}>
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {open && (
        <div
          className={[
            'absolute left-0 right-0 z-30 rounded-md border border-border bg-popover shadow-2xl shadow-black/40 p-2.5',
            direction === 'down' ? 'top-[calc(100%+4px)]' : 'bottom-[calc(100%+4px)]',
          ].join(' ')}
        >
          {optionsChildren}
        </div>
      )}
    </div>
  )
}

export function RepoSection({ repo, showHeader }: { repo: string; showHeader: boolean }) {
  const selectedRepo = useGitReposStore((s) => s.selectedRepo)
  const selectRepo = useGitReposStore((s) => s.selectRepo)
  const isExpanded = useGitExpandedReposStore((s) => (showHeader ? s.isExpanded(repo, selectedRepo) : true))
  const setExpanded = useGitExpandedReposStore((s) => s.setExpanded)
  const closeRepo = useGitOpenReposStore((s) => s.closeRepo)
  const { branch, status, commitMessage, commitError, commandStatus, aheadBehind } = useRepoGitState(repo)
  const {
    refresh,
    refreshStatus,
    stage,
    unstage,
    stageAll,
    unstageAll,
    discard,
    discardAll,
    setCommitMessage,
    commit,
    fetch: gitFetch,
    pull,
    push,
    publishBranch,
  } = useGitStore()
  const openTab = useEditorStore((s) => s.openTab)
  const loadGraph = useGitGraphStore((s) => s.load)
  const { forceAction, requestForce, closeForce } = useForcePushConfirm(repo)
  const commitMessageEnabled = useCommitMessageSettingsStore((s) => s.enabled)
  const commitMessageModel = useCommitMessageSettingsStore((s) => s.model)
  const commitMessagePrompt = useCommitMessageSettingsStore((s) => s.prompt)
  const [generatingMessage, setGeneratingMessage] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [generatingGif, setGeneratingGif] = useState<string | null>(null)

  async function generateCommitMessage() {
    setGeneratingMessage(true)
    setGeneratingGif(pickClaudeGif())
    setGenerateError(null)
    try {
      const diff = await window.api.gitStagedDiff(repo)
      const message = await window.api.commitMessageGenerate(diff, commitMessageModel, commitMessagePrompt)
      if (message) {
        setCommitMessage(repo, message)
      } else {
        setGenerateError('Could not generate a commit message')
      }
    } finally {
      setGeneratingMessage(false)
    }
  }

  const [menu, setMenu] = useState<ContextMenuState | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [discardTarget, setDiscardTarget] = useState<GitFileEntry | null>(null)
  const [discardAllConfirmOpen, setDiscardAllConfirmOpen] = useState(false)
  const [commitOptionsOpen, setCommitOptionsOpen] = useState(false)
  const [pushOptionsOpen, setPushOptionsOpen] = useState(false)

  // Mount does a full refresh (branch + ahead/behind + status): every section's
  // header shows branch and ahead/behind, not just the selected repo's, and
  // refresh() is the only action that populates those. Refocus deliberately
  // drops back to refreshStatus() — working-tree state is what goes stale while
  // the window is in the background, and a full refresh here would add two
  // extra IPC round-trips per open repo every time the window is focused.
  useEffect(() => {
    refresh(repo)
    const onFocus = () => refreshStatus(repo)
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [repo, refresh, refreshStatus])

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    const closeOnEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null) }
    window.addEventListener('click', close)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [menu])

  // Measure the actual rendered menu and clamp for real, before paint —
  // a hardcoded size estimate at the click site can under-guess it and let
  // the menu overhang the window.
  useLayoutEffect(() => {
    if (!menu || !menuRef.current) return
    const rect = menuRef.current.getBoundingClientRect()
    const clamped = clampToViewport(menu.x, menu.y, rect.width, rect.height)
    menuRef.current.style.left = `${clamped.x}px`
    menuRef.current.style.top = `${clamped.y}px`
  }, [menu])

  function openContextMenu(event: MouseEvent, file: GitFileEntry, staged: boolean) {
    event.preventDefault()
    event.stopPropagation()
    setMenu({ x: event.clientX, y: event.clientY, file, staged })
  }

  function openDiff(path: string, staged: boolean) {
    openTab({ path: buildGitDiffPath(repo, path, staged), content: '', dirty: false })
  }

  function copyPath(path: string) {
    navigator.clipboard?.writeText(path).catch(() => {
      const ta = document.createElement('textarea')
      ta.value = path
      ta.style.cssText = 'position:fixed;opacity:0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
    })
  }

  async function trashUntrackedFile(file: GitFileEntry) {
    await window.api.trashPath(`${repo}/${file.path}`)
    await refreshStatus(repo)
  }

  // Fetch/Pull/Push/force-push/Publish Branch route through gitStore's
  // runCommand(), which can reveal the Git Log tab (always, or on failure,
  // per the gitLogAutoShow setting). That tab renders whichever repo is
  // *globally* selected, so acting on a non-selected repo would pop open a
  // log showing a different repo's buffer — worst on failure, where the user
  // sees an empty or unrelated log and can't tell why the action failed.
  // Commit goes through its own IPC path rather than runCommand, but it
  // refreshes the Graph tab for its repo, so it follows the same rule.
  // Selecting this repo first keeps those panels pointed at the repo being
  // acted on, same as the Branch/Graph/List Diff buttons already do.
  function runOnThisRepo(run: () => void) {
    selectRepo(repo)
    run()
  }

  const isUntracked = menu?.file.status === '?'
  const isTrackedChange = menu && !menu.staged && menu.file.status !== '?'
  const remoteActionDisabled = commandStatus === 'running'
  // Matches discardAllChanges' scope (git reset --hard HEAD): staged changes
  // plus unstaged changes to already-tracked files. Untracked ('?') entries
  // aren't affected by that command, so they don't count toward "has
  // anything to discard" — the button would otherwise look enabled but do
  // nothing when only new/untracked files are present.
  const hasDiscardableChanges =
    status.staged.length > 0 || status.unstaged.some((file) => file.status !== '?')

  const body = (
    <>
      <div className="px-3 py-2 border-b border-border shrink-0 flex flex-col gap-1.5">
        <div className="relative">
          <textarea
            value={commitMessage}
            onChange={(e) => setCommitMessage(repo, e.target.value)}
            placeholder="Message"
            rows={3}
            className={[
              'w-full resize-none rounded border border-border bg-bg px-2 py-1.5 text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus:ring-1 focus:ring-accent/50',
              commitMessageEnabled ? 'pb-8' : '',
            ].join(' ')}
          />
          {commitMessageEnabled && (
            <button
              type="button"
              title="Generate commit message from staged changes with Claude"
              disabled={generatingMessage || status.staged.length === 0}
              onClick={generateCommitMessage}
              className={[
                'absolute bottom-1.5 right-1.5 w-7 h-7 flex items-center justify-center rounded-md border border-transparent transition-colors overflow-hidden',
                generatingMessage
                  ? ''
                  : 'hover:border-border hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed',
              ].join(' ')}
            >
              {generatingMessage && generatingGif ? (
                // Randomly picked per generation in generateCommitMessage() — GIFs
                // loop natively, so this just plays until the request resolves.
                <img src={generatingGif} alt="Generating…" className="w-full h-full object-contain" />
              ) : (
                <ClaudeIcon />
              )}
            </button>
          )}
        </div>
        {generateError && <p className="text-xs text-red-400">{generateError}</p>}
        {commitError && <p className="text-xs text-red-400">{commitError}</p>}
        <SplitCommandButton
          label="Commit"
          disabled={!commitMessage.trim() || status.staged.length === 0}
          onClick={() => runOnThisRepo(() => commit(repo))}
          colorClassName={accentSolidColor}
          open={commitOptionsOpen}
          onToggleOptions={() => setCommitOptionsOpen((v) => !v)}
          onCloseOptions={() => setCommitOptionsOpen(false)}
          direction="down"
          optionsChildren={
            <button
              type="button"
              disabled={!commitMessage.trim() || status.staged.length === 0}
              onClick={() => {
                runOnThisRepo(() => commit(repo, true))
                setCommitOptionsOpen(false)
              }}
              className="w-full flex flex-col items-start gap-0.5 rounded px-2 py-1.5 text-left text-xs text-fg transition-colors hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span className="font-mono">Commit --no-verify</span>
              <span className="text-fg-subtle">Skip the pre-commit and commit-msg hooks for this commit.</span>
            </button>
          }
        >
          Commit
        </SplitCommandButton>
      </div>

      <div className={showHeader ? 'overflow-y-auto py-1' : 'flex-1 overflow-y-auto py-1'}>
        <div className="mb-2">
          <div className="flex items-center justify-between px-3 py-1">
            <span className="text-[0.6875rem] font-semibold text-fg-muted uppercase tracking-wider">
              Staged Changes ({status.staged.length})
            </span>
            <button
              type="button"
              onClick={() => unstageAll(repo)}
              className="text-[0.6875rem] text-fg-muted transition-colors hover:text-fg"
            >
              -
            </button>
          </div>
          {status.staged.map((file) => (
            <FileRow
              key={file.path}
              file={file}
              staged
              onToggle={() => unstage(repo, file.path)}
              onOpenDiff={() => openDiff(file.path, true)}
              onContextMenu={(e) => openContextMenu(e, file, true)}
            />
          ))}
        </div>
        <div>
          <div className="flex items-center justify-between px-3 py-1">
            <span className="text-[0.6875rem] font-semibold text-fg-muted uppercase tracking-wider">
              Changes ({status.unstaged.length})
            </span>
            <span className="flex items-center gap-2">
              <button
                type="button"
                title="Discard All Changes"
                aria-label="Discard All Changes"
                disabled={!hasDiscardableChanges}
                onClick={() => setDiscardAllConfirmOpen(true)}
                className="text-fg-muted transition-colors hover:text-red-400 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-fg-muted"
              >
                <DiscardAllIcon />
              </button>
              <button
                type="button"
                onClick={() => stageAll(repo)}
                className="text-[0.6875rem] text-fg-muted transition-colors hover:text-fg"
              >
                +
              </button>
            </span>
          </div>
          {status.unstaged.map((file) => (
            <FileRow
              key={file.path}
              file={file}
              staged={false}
              onToggle={() => stage(repo, file.path)}
              onOpenDiff={() => openDiff(file.path, false)}
              onContextMenu={(e) => openContextMenu(e, file, false)}
            />
          ))}
        </div>
      </div>

      <div className="border-t border-border shrink-0 px-3 py-2 flex flex-col gap-1.5">
        <button
          type="button"
          className={`${pillButtonClass} px-2 overflow-hidden`}
          disabled={remoteActionDisabled}
          onClick={() => { selectRepo(repo); useSearchStore.getState().openBranchPalette() }}
        >
          <span className="truncate min-w-0">Branch: {branch ?? '—'}</span>
        </button>
        <div className="flex gap-1.5">
          <button
            type="button"
            className={pillButtonClass}
            disabled={remoteActionDisabled}
            onClick={() => runOnThisRepo(() => gitFetch(repo))}
          >
            Fetch
          </button>
          <button
            type="button"
            className={pillButtonClass}
            disabled={remoteActionDisabled}
            onClick={() => runOnThisRepo(() => pull(repo))}
          >
            Pull
          </button>
        </div>
        <SplitCommandButton
          label="Push"
          disabled={remoteActionDisabled}
          onClick={() => runOnThisRepo(() => push(repo))}
          colorClassName={accentSolidColor}
          open={pushOptionsOpen}
          onToggleOptions={() => setPushOptionsOpen((v) => !v)}
          onCloseOptions={() => setPushOptionsOpen(false)}
          direction="up"
          optionsChildren={
            <div className="flex flex-col gap-0.5">
              <button
                type="button"
                disabled={remoteActionDisabled || !branch}
                onClick={() => {
                  if (branch) runOnThisRepo(() => publishBranch(repo, branch))
                  setPushOptionsOpen(false)
                }}
                className="w-full flex flex-col items-start gap-0.5 rounded px-2 py-1.5 text-left text-xs text-fg transition-colors hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span className="font-semibold">Publish Branch</span>
                <span className="text-fg-subtle font-mono">git push -u origin {branch ?? '…'}</span>
                <span className="text-fg-subtle">Push a new branch and set its upstream, so a plain Push works after.</span>
              </button>
              <button
                type="button"
                disabled={remoteActionDisabled}
                onClick={() => { runOnThisRepo(() => requestForce('forcePush')); setPushOptionsOpen(false) }}
                className="w-full flex flex-col items-start gap-0.5 rounded px-2 py-1.5 text-left text-xs text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span className="font-semibold">Force Push</span>
                <span className="text-red-400/70">Overwrites the remote branch with your local history.</span>
              </button>
              <button
                type="button"
                disabled={remoteActionDisabled}
                onClick={() => { runOnThisRepo(() => requestForce('forcePushLease')); setPushOptionsOpen(false) }}
                className="w-full flex flex-col items-start gap-0.5 rounded px-2 py-1.5 text-left text-xs text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span className="font-semibold">Force Push with Lease</span>
                <span className="text-red-400/70">Safer force push — fails if the remote has commits you haven't fetched.</span>
              </button>
            </div>
          }
        >
          Push
        </SplitCommandButton>
        <div className="flex gap-1.5">
          <button
            type="button"
            className={pillButtonClass}
            onClick={() => {
              selectRepo(repo)
              openTab({ path: GIT_GRAPH_TAB_PATH, content: '', dirty: false })
              loadGraph(repo)
            }}
          >
            Graph
          </button>
          <button
            type="button"
            className={pillButtonClass}
            onClick={() => { selectRepo(repo); openTab({ path: GIT_BRANCH_DIFF_TAB_PATH, content: '', dirty: false }) }}
          >
            List Diff
          </button>
        </div>
      </div>

      {menu && createPortal(
        <div
          ref={menuRef}
          className="fixed z-[200] w-44 rounded border border-border bg-popover p-1 shadow-2xl shadow-black/50"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {!isUntracked && (
            <ContextMenuButton onClick={() => { openDiff(menu.file.path, menu.staged); setMenu(null) }}>
              View Diff
            </ContextMenuButton>
          )}
          {menu.staged ? (
            <ContextMenuButton onClick={() => { unstage(repo, menu.file.path); setMenu(null) }}>
              Unstage
            </ContextMenuButton>
          ) : (
            <ContextMenuButton onClick={() => { stage(repo, menu.file.path); setMenu(null) }}>
              Stage
            </ContextMenuButton>
          )}
          {isTrackedChange && (
            <>
              <ContextMenuDivider />
              <ContextMenuButton danger onClick={() => { setDiscardTarget(menu.file); setMenu(null) }}>
                Discard Changes
              </ContextMenuButton>
            </>
          )}
          {isUntracked && (
            <>
              <ContextMenuDivider />
              <ContextMenuButton danger onClick={() => { trashUntrackedFile(menu.file); setMenu(null) }}>
                Move to Trash
              </ContextMenuButton>
            </>
          )}
          <ContextMenuDivider />
          <ContextMenuButton onClick={() => { copyPath(menu.file.path); setMenu(null) }}>
            Copy Path
          </ContextMenuButton>
        </div>,
        document.body
      )}

      {discardTarget && (
        <Modal onClose={() => setDiscardTarget(null)}>
          <h2 className="text-sm font-semibold text-fg mb-1">Discard Changes</h2>
          <p className="text-sm text-fg-muted mb-5">
            Discard local changes to{' '}
            <span className="font-mono text-fg break-all">
              {discardTarget.path.split('/').pop()}
            </span>
            ? This cannot be undone.
          </p>
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setDiscardTarget(null)}
              className="px-4 py-1.5 text-sm rounded-lg border border-border text-fg-muted hover:text-fg hover:border-fg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                discard(repo, discardTarget.path)
                setDiscardTarget(null)
              }}
              className="px-4 py-1.5 text-sm rounded-lg bg-red-600/80 hover:bg-red-600 text-white font-semibold transition-colors"
            >
              Discard
            </button>
          </div>
        </Modal>
      )}

      {discardAllConfirmOpen && (
        <Modal onClose={() => setDiscardAllConfirmOpen(false)}>
          <h2 className="text-sm font-semibold text-fg mb-1">Discard All Changes</h2>
          <p className="text-sm text-fg-muted mb-5">
            Discard all staged and unstaged changes to tracked files? Untracked files are left
            alone. This cannot be undone.
          </p>
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setDiscardAllConfirmOpen(false)}
              className="px-4 py-1.5 text-sm rounded-lg border border-border text-fg-muted hover:text-fg hover:border-fg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                discardAll(repo)
                setDiscardAllConfirmOpen(false)
              }}
              className="px-4 py-1.5 text-sm rounded-lg bg-red-600/80 hover:bg-red-600 text-white font-semibold transition-colors"
            >
              Discard All
            </button>
          </div>
        </Modal>
      )}

      {forceAction && (
        <ConfirmForcePushModal action={forceAction} cwd={repo} onClose={closeForce} />
      )}
    </>
  )

  if (!showHeader) return body

  return (
    <div className="border-b border-border">
      <div
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        onClick={() => setExpanded(repo, !isExpanded)}
        onKeyDown={(e) => { if (e.key === 'Enter') setExpanded(repo, !isExpanded) }}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/5 transition-colors cursor-pointer"
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          className={['shrink-0 text-fg-subtle transition-transform', isExpanded ? 'rotate-180' : ''].join(' ')}
        >
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="flex flex-col min-w-0 flex-1">
          <span className="truncate text-sm text-fg">{repo.split('/').pop()}</span>
          <span className="truncate text-xs text-fg-muted">{branch ?? '—'}</span>
        </span>
        <span className="flex items-center gap-2 shrink-0 text-xs text-fg-muted tabular-nums">
          {aheadBehind && (
            <span className="flex items-center gap-1">
              <span>↓{aheadBehind.behind}</span>
              <span>↑{aheadBehind.ahead}</span>
            </span>
          )}
          <span>{status.staged.length + status.unstaged.length}</span>
        </span>
        <button
          type="button"
          aria-label="Reveal in File Tree"
          title="Reveal in File Tree"
          onClick={(e) => { e.stopPropagation(); useSidebarUiStore.getState().requestReveal(repo, true) }}
          className="shrink-0 h-6 w-6 rounded border border-border bg-bg flex items-center justify-center text-fg-muted hover:text-fg hover:border-fg-subtle transition-colors [&_svg]:w-3.5 [&_svg]:h-3.5"
        >
          <FilesIcon />
        </button>
        <button
          type="button"
          aria-label="Close Repo"
          title="Close Repo"
          onClick={(e) => { e.stopPropagation(); closeRepo(repo) }}
          className="shrink-0 h-6 w-6 rounded border border-border bg-bg flex items-center justify-center text-fg-muted hover:text-red-400 hover:border-fg-subtle transition-colors [&_svg]:w-3.5 [&_svg]:h-3.5"
        >
          <CloseRepoIcon />
        </button>
      </div>
      {isExpanded && body}
    </div>
  )
}
