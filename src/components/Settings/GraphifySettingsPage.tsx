import { useGraphifyStore } from '@/stores/graphifyStore'
import { useGraphifySettingsStore } from '@/stores/graphifySettingsStore'
import { Switch } from '@/components/ui/Toggle'
import { FeatureBlock, SettingRow } from './FeatureBlock'
import { ToolInstallRow } from './ToolInstallRow'

const getInstall = () => window.api.graphifyGetInstall()
const install = () => window.api.graphifyInstall()
const onProgress = (cb: (received: number, total: number) => void) => window.api.onGraphifyInstallProgress(cb)
// The Graphify panel stops showing its "graphify isn't installed" state.
const onInstalled = () => useGraphifyStore.setState({ available: true })

export function GraphifySettingsPage() {
  const enabled = useGraphifySettingsStore((s) => s.enabled)
  const setEnabled = useGraphifySettingsStore((s) => s.setEnabled)
  const autoBuildOnOpen = useGraphifySettingsStore((s) => s.autoBuildOnOpen)
  const setAutoBuildOnOpen = useGraphifySettingsStore((s) => s.setAutoBuildOnOpen)
  const gitignorePrompt = useGraphifySettingsStore((s) => s.gitignorePrompt)
  const setGitignorePrompt = useGraphifySettingsStore((s) => s.setGitignorePrompt)
  const claudeSkillPrompt = useGraphifySettingsStore((s) => s.claudeSkillPrompt)
  const setClaudeSkillPrompt = useGraphifySettingsStore((s) => s.setClaudeSkillPrompt)

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
          <SettingRow label="Remind to gitignore graphify-out/" description="Shows a notification when a repo's graphify-out/ isn't in its .gitignore. Click it to add the entry.">
            <Switch label="Remind to gitignore graphify-out" checked={gitignorePrompt} onChange={setGitignorePrompt} />
          </SettingRow>
          <SettingRow label="Remind to set up Claude Code" description="Shows a notification when a repo has a graph but Claude Code can't query it yet. Click it to add graphify's skill (.claude/skills/graphify plus a CLAUDE.md section).">
            <Switch label="Remind to set up graphify for Claude Code" checked={claudeSkillPrompt} onChange={setClaudeSkillPrompt} />
          </SettingRow>
        </FeatureBlock>
      </div>
    </div>
  )
}
