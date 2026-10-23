import { useEffect } from 'react'
import { AI_PRESETS } from '../../../electron/aiRulesPresets'
import { useAiRulesSettingsStore, type AiBoardRule, type AiRulesToolId } from '@/stores/aiRulesSettingsStore'
import { useTodoStore } from '@/stores/todoStore'
import { Select } from '@/components/ui/Select'
import { Switch } from '@/components/ui/Toggle'
import { SettingRow } from './FeatureBlock'
import { AiRulesList } from './AiRulesList'

const INPUT_CLASS =
  'h-8 w-full min-w-0 rounded-lg border border-border bg-bg px-2 text-sm text-fg placeholder:text-fg-subtle focus:border-accent/60 focus:outline-none'
const BUTTON_CLASS = 'h-8 rounded border border-border px-3 text-sm text-fg transition-colors hover:border-fg-subtle'

// A tool's AI rules, shown under its "Claude Code" switch: the preset
// controls we define, the board table for To Do, then free-text extras.
export function AiRulesSection({ tool }: { tool: AiRulesToolId }) {
  useEffect(() => {
    useAiRulesSettingsStore.getState().init()
  }, [])

  return (
    <div role="group" aria-label="AI rules" className="mt-2 border-l-2 border-border pl-3">
      <div className="text-sm font-semibold text-fg">AI rules</div>
      <div className="mt-0.5 max-w-[52ch] text-xs text-fg-muted">How Claude should use this tool, in every session it starts.</div>
      <PresetControls tool={tool} />
      {tool === 'todos' && <BoardRulesTable />}
      <AiRulesList id={tool} label="Extra rules" showReset={false} />
    </div>
  )
}

function PresetControls({ tool }: { tool: AiRulesToolId }) {
  const values = useAiRulesSettingsStore((s) => s.presets[tool])
  const setPreset = useAiRulesSettingsStore((s) => s.setPreset)

  return (
    <div className="mt-1">
      {AI_PRESETS[tool].map((p) =>
        p.kind === 'toggle' ? (
          <SettingRow key={p.id} label={p.label}>
            <Switch label={p.label} checked={(values[p.id] ?? p.default) === true} onChange={(v) => setPreset(tool, p.id, v)} />
          </SettingRow>
        ) : (
          <SettingRow key={p.id} label={p.label}>
            <div className="w-56">
              <Select
                value={String(values[p.id] ?? p.default)}
                onChange={(v) => setPreset(tool, p.id, v)}
                options={p.choices.map((c) => ({ value: c.value, label: c.label }))}
                ariaLabel={p.label}
              />
            </div>
          </SettingRow>
        )
      )}
    </div>
  )
}

const EMPTY_ROW: AiBoardRule = { board: '', boardName: '', useFor: '', notFor: '', tags: '', folders: '' }

const COLUMNS: { field: keyof AiBoardRule; label: string; placeholder: string }[] = [
  { field: 'useFor', label: 'Use for', placeholder: 'devops-self-service, alerting' },
  { field: 'notFor', label: 'Not for', placeholder: 'app deploys' },
  { field: 'tags', label: 'Required tags', placeholder: 'new, support' },
  { field: 'folders', label: 'Linked folders', placeholder: '~/code/my-repo' },
]

// Which board Claude files each ticket on. One row per board.
function BoardRulesTable() {
  const boards = useAiRulesSettingsStore((s) => s.boards)
  const setBoards = useAiRulesSettingsStore((s) => s.setBoards)
  const projects = useTodoStore((s) => s.projects)

  useEffect(() => {
    void useTodoStore.getState().loadProjects()
  }, [])

  const update = (index: number, patch: Partial<AiBoardRule>) =>
    setBoards(boards.map((b, i) => (i === index ? { ...b, ...patch } : b)))
  const boardOptions = [
    { value: '', label: 'Pick a board' },
    ...projects.map((p) => ({ value: p.key, label: `${p.key} (${p.name})` })),
  ]

  return (
    <div role="group" aria-label="Board rules" className="py-1.5">
      <div className="text-sm text-fg">Board rules</div>
      <div className="mt-0.5 text-xs text-fg-muted">Which board Claude files each ticket on. Tickets are numbered by board key, e.g. VIDE-12.</div>
      {boards.length > 0 && (
        <div className="mt-1.5 overflow-x-auto">
          <table className="w-full min-w-[720px] border-separate border-spacing-1 text-left">
            <thead>
              <tr className="text-xs text-fg-muted">
                <th className="w-48 font-normal">Board</th>
                {COLUMNS.map((c) => (
                  <th key={c.field} className="font-normal">{c.label}</th>
                ))}
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {boards.map((row, index) => (
                <tr key={index}>
                  <td>
                    <Select
                      value={row.board}
                      onChange={(key) => update(index, { board: key, boardName: projects.find((p) => p.key === key)?.name ?? '' })}
                      options={
                        row.board && !projects.some((p) => p.key === row.board)
                          ? [...boardOptions, { value: row.board, label: row.board }]
                          : boardOptions
                      }
                      ariaLabel={`Board ${index + 1}`}
                    />
                  </td>
                  {COLUMNS.map((c) => (
                    <td key={c.field}>
                      <input
                        type="text"
                        value={row[c.field]}
                        onChange={(e) => update(index, { [c.field]: e.target.value })}
                        placeholder={c.placeholder}
                        aria-label={`${c.label} ${index + 1}`}
                        className={INPUT_CLASS}
                      />
                    </td>
                  ))}
                  <td>
                    <button
                      type="button"
                      onClick={() => setBoards(boards.filter((_, i) => i !== index))}
                      aria-label={`Remove board rule ${index + 1}`}
                      title="Remove"
                      className="flex h-8 w-8 items-center justify-center rounded border border-border text-fg-muted transition-colors hover:border-fg-subtle hover:text-fg"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <button type="button" onClick={() => setBoards([...boards, EMPTY_ROW])} className={`mt-2 ${BUTTON_CLASS}`}>
        Add board rule
      </button>
    </div>
  )
}
