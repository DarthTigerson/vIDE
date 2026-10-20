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
          <button
            type="button"
            className="h-8 rounded-full bg-accent/80 px-4 text-xs font-bold tracking-tight text-on-accent transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-40"
            disabled={!projectRoot || installingSkill}
            onClick={() => projectRoot && installClaudeSkill(projectRoot)}
          >
            {installingSkill ? 'Enabling…' : 'Enable for Claude Code'}
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
