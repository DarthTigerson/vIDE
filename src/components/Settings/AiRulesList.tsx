import { useEffect, useRef } from 'react'
import { useAiRulesSettingsStore, type AiRulesListId } from '@/stores/aiRulesSettingsStore'

const BUTTON_CLASS = 'h-8 rounded border border-border px-3 text-sm text-fg transition-colors hover:border-fg-subtle'

// One editable list of AI rules: each row is one line ("- rule") in the
// prompt every Claude session vIDE starts gets. Saved as you type.
export function AiRulesList({ id, label = 'AI rules', description, showReset = true }: {
  id: AiRulesListId
  label?: string
  description?: string
  showReset?: boolean
}) {
  const rules = useAiRulesSettingsStore((s) => s.lists[id])
  const setList = useAiRulesSettingsStore((s) => s.setList)
  const resetList = useAiRulesSettingsStore((s) => s.resetList)
  const focusLast = useRef(false)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    useAiRulesSettingsStore.getState().init()
  }, [])

  useEffect(() => {
    if (!focusLast.current) return
    focusLast.current = false
    listRef.current?.querySelector<HTMLInputElement>('li:last-child input')?.focus()
  }, [rules.length])

  const update = (index: number, value: string) => setList(id, rules.map((r, i) => (i === index ? value : r)))
  const remove = (index: number) => setList(id, rules.filter((_, i) => i !== index))
  const add = () => {
    focusLast.current = true
    setList(id, [...rules, ''])
  }

  return (
    <div role="group" aria-label={label} className="max-w-[460px] py-1.5">
      <div className="text-sm text-fg">{label}</div>
      {description && <div className="mt-0.5 text-xs text-fg-muted">{description}</div>}
      <ul ref={listRef} className="mt-1.5 flex flex-col gap-1.5">
        {rules.map((rule, index) => (
          <li key={index} className="flex items-center gap-1.5">
            <input
              type="text"
              value={rule}
              onChange={(e) => update(index, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  add()
                }
              }}
              aria-label={`${label} ${index + 1}`}
              placeholder="Describe one rule"
              className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-bg px-2 text-sm text-fg placeholder:text-fg-subtle focus:border-accent/60 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => remove(index)}
              aria-label={`Remove ${label.toLowerCase()} ${index + 1}`}
              title="Remove"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-border text-fg-muted transition-colors hover:border-fg-subtle hover:text-fg"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={add} className={BUTTON_CLASS}>
          Add rule
        </button>
        {showReset && (
          <button type="button" onClick={() => void resetList(id)} className={BUTTON_CLASS}>
            Reset to default
          </button>
        )}
      </div>
    </div>
  )
}
