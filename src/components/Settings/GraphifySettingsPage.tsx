import { useGraphifyStore } from '@/stores/graphifyStore'
import { useGraphifySettingsStore } from '@/stores/graphifySettingsStore'
import { useFileStore } from '@/stores/fileStore'
import { Toggle } from '@/components/ui/Toggle'
import { Section, Row } from './SettingsLayout'

export function GraphifySettingsPage() {
  const projectRoot = useFileStore((s) => s.projectRoot)
  const { installingSkill, skillInstallResult, installClaudeSkill } = useGraphifyStore()
  const enabled = useGraphifySettingsStore((s) => s.enabled)
  const setEnabled = useGraphifySettingsStore((s) => s.setEnabled)
  const autoBuildOnOpen = useGraphifySettingsStore((s) => s.autoBuildOnOpen)
  const setAutoBuildOnOpen = useGraphifySettingsStore((s) => s.setAutoBuildOnOpen)

  return (
    <div className="h-full overflow-auto p-6 bg-panel">
      <h1 className="text-base font-semibold text-fg mb-1">Graphify</h1>
      <p className="text-sm text-fg-muted mb-4">
        graphify builds a knowledge graph of your codebase, viewable from the Graphify panel.
      </p>

      <Section label="General">
        <Row>
          <Toggle
            className="max-w-[60ch]"
            label="Enable Graphify"
            description="Adds a Graphify icon to the activity bar with the knowledge graph panel."
            checked={enabled}
            onChange={setEnabled}
          />
        </Row>
        <Row>
          <Toggle
            className="max-w-[60ch]"
            label="Auto-build graph when a repo is opened"
            description="Runs graphify automatically the first time you open a repo each session, instead of waiting for a manual click."
            checked={autoBuildOnOpen}
            onChange={setAutoBuildOnOpen}
          />
          {autoBuildOnOpen && (
            <p className="mt-2 max-w-[60ch] text-xs text-amber-400 border border-amber-400/30 rounded p-2">
              Building a graph spawns a real CLI process and uses CPU — on a large repo or a slower
              machine this can be noticeable. Turn this off if you'd rather trigger builds manually
              from the Graphify panel.
            </p>
          )}
        </Row>
      </Section>

      <Section label="Claude Code">
        <Row>
          <p className="text-sm text-fg-muted mb-3">
            Registers graphify as a Claude Code skill for the current project
            (<code className="text-xs bg-white/10 rounded px-1 py-0.5">.claude/skills/graphify</code>, plus a
            CLAUDE.md section), so Claude can query the graph itself
            (<code className="text-xs bg-white/10 rounded px-1 py-0.5">graphify query</code>/
            <code className="text-xs bg-white/10 rounded px-1 py-0.5">explain</code>/
            <code className="text-xs bg-white/10 rounded px-1 py-0.5">path</code>) instead of grepping raw files —
            saving tokens on codebase questions.
          </p>

          <button
            type="button"
            className="w-full h-8 rounded-full flex items-center justify-center text-xs font-bold tracking-tight bg-accent/80 text-on-accent transition-colors hover:bg-accent disabled:opacity-40 disabled:pointer-events-none"
            disabled={!projectRoot || installingSkill}
            onClick={() => projectRoot && installClaudeSkill(projectRoot)}
          >
            {installingSkill ? 'Enabling…' : 'Enable for Claude Code'}
          </button>

          {skillInstallResult && (
            <div
              className={`mt-3 text-xs whitespace-pre-wrap border rounded p-2 max-h-64 overflow-y-auto ${
                skillInstallResult.ok ? 'text-fg-muted border-border' : 'text-red-400 border-red-400/30'
              }`}
            >
              {skillInstallResult.ok
                ? 'Claude Code can now use graphify on this project (skill + CLAUDE.md added under .claude/ and staged — review and commit to share with your team).'
                : `Failed to enable graphify for Claude Code:\n${skillInstallResult.output}`}
            </div>
          )}
        </Row>
      </Section>
    </div>
  )
}
