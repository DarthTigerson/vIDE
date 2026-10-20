import { useEffect, useState } from 'react'
import { useGraphifyStore } from '@/stores/graphifyStore'
import { useGraphifySettingsStore } from '@/stores/graphifySettingsStore'
import { useFileStore } from '@/stores/fileStore'
import { Switch } from '@/components/ui/Toggle'
import { FeatureBlock, SettingRow } from './FeatureBlock'
import { ToolInstallRow } from './ToolInstallRow'

const getInstall = () => window.api.graphifyGetInstall()
const install = () => window.api.graphifyInstall()
const onProgress = (cb: (received: number, total: number) => void) => window.api.onGraphifyInstallProgress(cb)
// The Graphify panel stops showing its "graphify isn't installed" state.
const onInstalled = () => useGraphifyStore.setState({ available: true })

export function GraphifySettingsPage() {
  const projectRoot = useFileStore((s) => s.projectRoot)
  const { installingSkill, skillInstallResult, installClaudeSkill } = useGraphifyStore()
  const enabled = useGraphifySettingsStore((s) => s.enabled)
  const setEnabled = useGraphifySettingsStore((s) => s.setEnabled)
  const autoBuildOnOpen = useGraphifySettingsStore((s) => s.autoBuildOnOpen)
  const setAutoBuildOnOpen = useGraphifySettingsStore((s) => s.setAutoBuildOnOpen)
  const hideOutputInTree = useGraphifySettingsStore((s) => s.hideOutputInTree)
  const setHideOutputInTree = useGraphifySettingsStore((s) => s.setHideOutputInTree)

  // null while checking (or with no project open). Re-checked after each
  // install attempt so the status flips without reopening Settings.
  const [skillInstalled, setSkillInstalled] = useState<boolean | null>(null)

  useEffect(() => {
    setSkillInstalled(null)
    if (!projectRoot || installingSkill) return
    let cancelled = false
    window.api.graphifyClaudeSkillInstalled(projectRoot)
      .then((installed) => { if (!cancelled) setSkillInstalled(installed) })
      .catch(() => { if (!cancelled) setSkillInstalled(false) })
    return () => { cancelled = true }
  }, [projectRoot, installingSkill])

  const [gitignoreStatus, setGitignoreStatus] = useState<'ignored' | 'notIgnored' | 'notRepo' | null>(null)
  const [updatingGitignore, setUpdatingGitignore] = useState(false)
  const [gitignoreError, setGitignoreError] = useState<string | null>(null)

  useEffect(() => {
    setGitignoreStatus(null)
    setGitignoreError(null)
    if (!projectRoot) return
    let cancelled = false
    window.api.graphifyGitignoreStatus(projectRoot)
      .then((status) => { if (!cancelled) setGitignoreStatus(status) })
      .catch(() => { if (!cancelled) setGitignoreStatus('notRepo') })
    return () => { cancelled = true }
  }, [projectRoot])

  const setGitignored = async (value: boolean) => {
    if (!projectRoot) return
    setUpdatingGitignore(true)
    setGitignoreError(null)
    try {
      const result = value
        ? await window.api.graphifyAddToGitignore(projectRoot)
        : await window.api.graphifyRemoveFromGitignore(projectRoot)
      if (!result.ok) setGitignoreError(result.output)
      setGitignoreStatus(await window.api.graphifyGitignoreStatus(projectRoot))
    } catch (err) {
      setGitignoreError(err instanceof Error ? err.message : String(err))
    } finally {
      setUpdatingGitignore(false)
    }
  }

  return (
    <div className="h-full overflow-auto bg-panel p-6">
      <div className="max-w-[1000px]">
        <h1 className="mb-1 text-base font-semibold text-fg">Graphify</h1>
        <p className="mb-4 text-sm text-fg-muted">graphify builds a knowledge graph of your codebase, viewable from the Graphify panel.</p>

        <FeatureBlock
          title="Graphify"
          description="Adds a Graphify icon to the activity bar with the knowledge graph panel."
          toggle={{ checked: enabled, onChange: setEnabled, label: 'Enable Graphify' }}
        >
          <ToolInstallRow
            name="graphify"
            notInstalled="Not installed. vIDE can install it with uv for you (it fetches uv itself if needed), no terminal needed."
            getInstall={getInstall}
            install={install}
            onProgress={onProgress}
            onInstalled={onInstalled}
          />
          <SettingRow label="Build when a repo opens" description="The first time you open a repo each session, instead of waiting for a manual click.">
            <Switch label="Auto-build graph when a repo is opened" checked={autoBuildOnOpen} onChange={setAutoBuildOnOpen} />
          </SettingRow>
          {autoBuildOnOpen && (
            <p className="mt-1 max-w-[460px] rounded border border-amber-400/30 p-2 text-xs text-amber-400">
              Building a graph spawns a real CLI process and uses CPU — on a large repo or a slower
              machine this can be noticeable. Turn this off if you'd rather trigger builds manually
              from the Graphify panel.
            </p>
          )}
        </FeatureBlock>

        <FeatureBlock
          title="Output folder"
          description={
            <>
              graphify writes its build output to{' '}
              <code className="rounded bg-white/10 px-1 py-0.5 text-[0.95em]">graphify-out/</code> in the project root.
            </>
          }
        >
          <SettingRow label="Hide from the file tree" description="Hides graphify-out/ from the Explorer. The files stay on disk.">
            <Switch label="Hide graphify-out from the file tree" checked={hideOutputInTree} onChange={setHideOutputInTree} />
          </SettingRow>

          <SettingRow label="Gitignore graphify-out" description="Adds graphify-out/ to this project's .gitignore so the graph isn't committed.">
            <Switch
              label="Gitignore graphify-out"
              checked={gitignoreStatus === 'ignored'}
              onChange={setGitignored}
              disabled={!projectRoot || updatingGitignore || gitignoreStatus === null || gitignoreStatus === 'notRepo'}
            />
          </SettingRow>
          <p className="mt-1 max-w-[460px] rounded border border-border p-2 text-xs text-fg-muted">
            {gitignoreStatus === 'notRepo'
              ? "This project isn't a git repository yet. If you put it under git later, add graphify-out/ to its .gitignore to keep the graph output out of the repo."
              : 'You can also do this manually by adding graphify-out/ to your .gitignore. Turning this off only removes a plain graphify-out entry from the project\'s .gitignore; a broader rule elsewhere will keep it ignored.'}
          </p>
          {gitignoreError && (
            <p className="mt-1 max-w-[460px] whitespace-pre-wrap rounded border border-red-400/30 p-2 text-xs text-red-400">
              Couldn't update .gitignore: {gitignoreError}
            </p>
          )}
        </FeatureBlock>

        <FeatureBlock
          title="Claude Code"
          description={
            <>
              Registers graphify as a Claude Code skill for the current project
              (<code className="rounded bg-white/10 px-1 py-0.5 text-[0.95em]">.claude/skills/graphify</code>, plus a
              CLAUDE.md section), so Claude can query the graph instead of grepping raw files, saving tokens on
              codebase questions.
            </>
          }
        >
          {skillInstalled !== null && (
            <div className="mb-3 flex items-center gap-2 text-sm">
              <span className={`h-2 w-2 rounded-full ${skillInstalled ? 'bg-green-400' : 'bg-fg-muted/50'}`} />
              <span className={skillInstalled ? 'text-fg' : 'text-fg-muted'}>
                {skillInstalled ? 'Enabled for this project' : 'Not enabled for this project'}
              </span>
            </div>
          )}

          <button
            type="button"
            className={`h-8 rounded-full px-4 text-xs font-bold tracking-tight transition-colors disabled:pointer-events-none disabled:opacity-40 ${
              skillInstalled
                ? 'border border-border text-fg-muted hover:bg-white/5 hover:text-fg'
                : 'bg-accent/80 text-on-accent hover:bg-accent'
            }`}
            disabled={!projectRoot || installingSkill}
            onClick={() => projectRoot && installClaudeSkill(projectRoot)}
          >
            {installingSkill ? 'Enabling…' : skillInstalled ? 'Reinstall / update' : 'Enable for Claude Code'}
          </button>

          {skillInstallResult && (
            <div
              className={`mt-3 max-h-64 max-w-[560px] overflow-y-auto whitespace-pre-wrap rounded border p-2 text-xs ${
                skillInstallResult.ok ? 'border-border text-fg-muted' : 'border-red-400/30 text-red-400'
              }`}
            >
              {skillInstallResult.ok
                ? 'Claude Code can now use graphify on this project (skill + CLAUDE.md added under .claude/ and staged — review and commit to share with your team).'
                : `Failed to enable graphify for Claude Code:\n${skillInstallResult.output}`}
            </div>
          )}
        </FeatureBlock>
      </div>
    </div>
  )
}
