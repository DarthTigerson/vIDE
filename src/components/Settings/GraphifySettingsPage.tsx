import { useGraphifyStore } from '@/stores/graphifyStore'
import { useGraphifySettingsStore } from '@/stores/graphifySettingsStore'
import { useFileStore } from '@/stores/fileStore'
import { Toggle } from '@/components/ui/Toggle'

export function GraphifySettingsPage() {
  const projectRoot = useFileStore((s) => s.projectRoot)
  const { installingSkill, skillInstallResult, installClaudeSkill } = useGraphifyStore()
  const enabled = useGraphifySettingsStore((s) => s.enabled)
  const setEnabled = useGraphifySettingsStore((s) => s.setEnabled)

  return (
    <div className="h-full overflow-auto p-6 bg-panel">
      <h1 className="text-base font-semibold text-fg mb-1">Graphify</h1>
      <p className="text-sm text-fg-muted mb-8">
        graphify builds a knowledge graph of your codebase, viewable from the Graphify panel.
      </p>

      <div className="grid grid-cols-1 gap-6 max-w-lg">
        <section className="rounded-xl border border-border/60 p-4 flex flex-col gap-5">
          <h2 className="text-xs font-semibold text-fg-muted uppercase tracking-wider">
            General
          </h2>

          <Toggle
            label="Enable Graphify"
            description="Adds a Graphify icon to the activity bar with the knowledge graph panel."
            checked={enabled}
            onChange={setEnabled}
          />
        </section>

        <section className="rounded-xl border border-border/60 p-4 flex flex-col gap-4">
          <h2 className="text-xs font-semibold text-fg-muted uppercase tracking-wider">Claude Code</h2>
          <p className="text-sm text-fg-muted">
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
              className={`text-xs whitespace-pre-wrap border rounded p-2 max-h-64 overflow-y-auto ${
                skillInstallResult.ok ? 'text-fg-muted border-border' : 'text-red-400 border-red-400/30'
              }`}
            >
              {skillInstallResult.ok
                ? 'Claude Code can now use graphify on this project (skill + CLAUDE.md added under .claude/ and staged — review and commit to share with your team).'
                : `Failed to enable graphify for Claude Code:\n${skillInstallResult.output}`}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
