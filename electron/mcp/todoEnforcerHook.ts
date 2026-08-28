import { readActiveTodo, readTodosData } from '../todosStore'

export interface StopHookInput {
  stop_hook_active?: boolean
}

export interface HookBlockDecision {
  decision: 'block'
  reason: string
}

// Core decision logic for the vide-todo-enforcer plugin's Stop hook. Kept
// separate from stdin/stdout process wiring (see todoEnforcerHookMain.ts) so
// it's directly unit-testable, matching the todoTools.ts / todoMcpServer.ts
// split already used for the MCP server.
export async function decideStopAction(
  dataDir: string,
  input: StopHookInput
): Promise<HookBlockDecision | null> {
  // Never block twice in a row on the same stop attempt — stop_hook_active
  // is true when this run is already a forced continuation from a previous
  // block, so blocking again here would loop forever.
  if (input.stop_hook_active) return null

  const active = await readActiveTodo(dataDir)
  if (!active || active.commentLogged) return null

  // Self-heal: if the marker points at a ticket that no longer exists or has
  // since been archived (e.g. deleted/archived through a path that doesn't
  // itself clear the marker), don't block — there's nothing left to comment on.
  const { todos } = await readTodosData(dataDir)
  const todo = todos.find((t) => t.id === active.id)
  if (!todo || todo.archived) return null

  return {
    decision: 'block',
    reason:
      `You started ${active.id} but haven't logged a progress comment on it yet. Call add_todo_comment ` +
      `on ${active.id} summarizing what you've done or found so far before finishing this turn — future ` +
      'sessions rely on this trail.',
  }
}
