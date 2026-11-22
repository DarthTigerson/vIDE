const TERMINAL_PREFIX = 'terminal://'
export function isTerminalTab(path: string): boolean { return path.startsWith(TERMINAL_PREFIX) }
export function buildTerminalPath(id: string): string { return TERMINAL_PREFIX + id }
export function getTerminalId(path: string): string { return path.slice(TERMINAL_PREFIX.length) }

const BROWSER_PREFIX = 'browser://'
export function isBrowserTab(path: string): boolean { return path.startsWith(BROWSER_PREFIX) }
export function buildBrowserPath(id: string): string { return BROWSER_PREFIX + id }
export function getBrowserId(path: string): string { return path.slice(BROWSER_PREFIX.length) }

export const GENERAL_SETTINGS_TAB_PATH = 'settings://General'
export const DISPLAY_TAB_PATH = 'settings://Display'
export const FILE_TREE_SETTINGS_TAB_PATH = 'settings://Site Tree'
export const EDITOR_SETTINGS_TAB_PATH = 'settings://Editor'
export const GIT_SETTINGS_TAB_PATH = 'settings://Git'
export const BROWSER_SETTINGS_TAB_PATH = 'settings://Browser'
export const CLAUDE_SETTINGS_TAB_PATH = 'settings://Claude'
export const BRIDGE_SETTINGS_TAB_PATH = 'settings://Bridge'
export const GRAPHIFY_SETTINGS_TAB_PATH = 'settings://Graphify'
export const MOBILE_SETTINGS_TAB_PATH = 'settings://Mobile'
export const TODO_SETTINGS_TAB_PATH = 'settings://Todo'
export const NOTES_SETTINGS_TAB_PATH = 'settings://Notes'
export const SCRIPTS_SETTINGS_TAB_PATH = 'settings://Scripts'
export const LLAMA_SETTINGS_TAB_PATH = 'settings://Llama'
export const STORE_SETTINGS_TAB_PATH = 'settings://Store'
export const AGENT_TOOLING_SETTINGS_TAB_PATH = 'settings://AgentTooling'
// Version, update check and release history (VIDE-143).
export const ABOUT_SETTINGS_TAB_PATH = 'settings://About'
// Done sound / speaking mode when Claude or Rocky finishes.
export const SOUND_SETTINGS_TAB_PATH = 'settings://Sound'
export const GIT_LOG_TAB_PATH = 'git-log://Git Log'

export function isSettingsTab(path: string): boolean {
  return path.startsWith('settings://')
}

export function isGitLogTab(path: string): boolean {
  return path === GIT_LOG_TAB_PATH
}

export const GIT_GRAPH_TAB_PATH = 'git-graph://Graph'

export function isGitGraphTab(path: string): boolean {
  return path === GIT_GRAPH_TAB_PATH
}

export const GIT_BRANCH_DIFF_TAB_PATH = 'git-branch-diff://Branch Diff'

export function isGitBranchDiffTab(path: string): boolean {
  return path === GIT_BRANCH_DIFF_TAB_PATH
}

export const GRAPHIFY_GRAPH_TAB_PATH = 'graphify-graph://Graphify'

export function isGraphifyGraphTab(path: string): boolean {
  return path === GRAPHIFY_GRAPH_TAB_PATH
}

export const USAGE_GRAPH_TAB_PATH = 'usage-graph://Usage Graph'

export function isUsageGraphTab(path: string): boolean {
  return path === USAGE_GRAPH_TAB_PATH
}

// Silent alarms page, opened by clicking the footer clock (VIDE-141).
export const ALARMS_TAB_PATH = 'alarms://Alarms'

export function isAlarmsTab(path: string): boolean {
  return path === ALARMS_TAB_PATH
}

// In-app update progress page, opened from the update notification (VIDE-142).
export const UPDATE_TAB_PATH = 'update://Update'

export function isUpdateTab(path: string): boolean {
  return path === UPDATE_TAB_PATH
}

// vSuite Store: the catalog grid, and one page per app (store://app/<id>).
export const STORE_TAB_PATH = 'store://Store'
const STORE_APP_PREFIX = 'store://app/'
export function isStoreTab(path: string): boolean { return path.startsWith('store://') }
export function buildStoreAppPath(id: string): string { return STORE_APP_PREFIX + id }
// A language server's Store page (store://server/<id>).
const STORE_SERVER_PREFIX = 'store://server/'
export function buildStoreServerPath(id: string): string { return STORE_SERVER_PREFIX + id }
export function storeServerIdFromPath(path: string): string | null {
  return path.startsWith(STORE_SERVER_PREFIX) ? path.slice(STORE_SERVER_PREFIX.length) || null : null
}
export function storeAppIdFromPath(path: string): string | null {
  return path.startsWith(STORE_APP_PREFIX) ? path.slice(STORE_APP_PREFIX.length) || null : null
}

const TODO_BOARD_PREFIX = 'todo-board://'
export function isTodoBoardTab(path: string): boolean { return path.startsWith(TODO_BOARD_PREFIX) }
export function buildTodoBoardPath(projectId: string): string { return TODO_BOARD_PREFIX + projectId }
export function getTodoBoardProjectId(path: string): string { return path.slice(TODO_BOARD_PREFIX.length) }

// Llama model editor page. `new` opens a blank form; `<modelId>` opens the
// existing model for editing (todo-board://<projectId> pattern).
const LLAMA_MODEL_PREFIX = 'llama-model://'
export function isLlamaModelTab(path: string): boolean { return path.startsWith(LLAMA_MODEL_PREFIX) }
export function buildLlamaModelPath(modelId?: string): string { return LLAMA_MODEL_PREFIX + (modelId ?? 'new') }
export function getLlamaModelId(path: string): string { return path.slice(LLAMA_MODEL_PREFIX.length) }

// Projects moved to the Trash from the To Do sidebar, with Restore.
export const TODO_TRASH_TAB_PATH = 'todo-trash://Trash'
export function isTodoTrashTab(path: string): boolean { return path === TODO_TRASH_TAB_PATH }

const TODO_DETAIL_PREFIX = 'todo-detail://'
export function isTodoDetailTab(path: string): boolean { return path.startsWith(TODO_DETAIL_PREFIX) }
export function buildTodoDetailPath(projectId: string, todoId: string): string {
  return TODO_DETAIL_PREFIX + projectId + '/' + todoId
}
export function getTodoDetailIds(path: string): { projectId: string; todoId: string } {
  const [projectId, todoId] = path.slice(TODO_DETAIL_PREFIX.length).split('/')
  return { projectId, todoId }
}


// A script's editor page (Scripts app).
const SCRIPT_PREFIX = 'script://'
export function isScriptTab(path: string): boolean { return path.startsWith(SCRIPT_PREFIX) }
export function buildScriptPath(scriptId: string): string { return SCRIPT_PREFIX + scriptId }
export function getScriptId(path: string): string { return path.slice(SCRIPT_PREFIX.length) }

// Store apps (vSuite): tab kinds an app registers open as
// app-tab://<appId>/<kind>?p=<json params>, and each app's settings page is
// settings://app/<appId>.
const APP_TAB_PREFIX = 'app-tab://'
const APP_SETTINGS_PREFIX = 'settings://app/'
export function isAppTabPath(path: string): boolean { return path.startsWith(APP_TAB_PREFIX) }
export function buildAppTabPath(appId: string, kind: string, params: unknown): string {
  return `${APP_TAB_PREFIX}${appId}/${kind}?p=${encodeURIComponent(JSON.stringify(params ?? null))}`
}
export function parseAppTabPath(path: string): { appId: string; kind: string; params: unknown } | null {
  if (!isAppTabPath(path)) return null
  const rest = path.slice(APP_TAB_PREFIX.length)
  const q = rest.indexOf('?p=')
  const head = q === -1 ? rest : rest.slice(0, q)
  const slash = head.indexOf('/')
  if (slash <= 0 || slash === head.length - 1) return null
  let params: unknown = null
  if (q !== -1) {
    try { params = JSON.parse(decodeURIComponent(rest.slice(q + 3))) } catch { return null }
  }
  return { appId: head.slice(0, slash), kind: head.slice(slash + 1), params }
}
export function buildAppSettingsPath(appId: string): string { return APP_SETTINGS_PREFIX + appId }
export function appSettingsIdFromPath(path: string): string | null {
  return path.startsWith(APP_SETTINGS_PREFIX) ? path.slice(APP_SETTINGS_PREFIX.length) || null : null
}
