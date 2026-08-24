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
export const EDITOR_SETTINGS_TAB_PATH = 'settings://Editor'
export const GIT_SETTINGS_TAB_PATH = 'settings://Git'
export const BROWSER_SETTINGS_TAB_PATH = 'settings://Browser'
export const MODELS_SETTINGS_TAB_PATH = 'settings://Models'
export const GRAPHIFY_SETTINGS_TAB_PATH = 'settings://Graphify'
export const JIRA_SETTINGS_TAB_PATH = 'settings://Jira'
export const DOCKER_SETTINGS_TAB_PATH = 'settings://Docker'
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

const TODO_BOARD_PREFIX = 'todo-board://'
export function isTodoBoardTab(path: string): boolean { return path.startsWith(TODO_BOARD_PREFIX) }
export function buildTodoBoardPath(projectId: string): string { return TODO_BOARD_PREFIX + projectId }
export function getTodoBoardProjectId(path: string): string { return path.slice(TODO_BOARD_PREFIX.length) }

const TODO_DETAIL_PREFIX = 'todo-detail://'
export function isTodoDetailTab(path: string): boolean { return path.startsWith(TODO_DETAIL_PREFIX) }
export function buildTodoDetailPath(projectId: string, todoId: string): string {
  return TODO_DETAIL_PREFIX + projectId + '/' + todoId
}
export function getTodoDetailIds(path: string): { projectId: string; todoId: string } {
  const [projectId, todoId] = path.slice(TODO_DETAIL_PREFIX.length).split('/')
  return { projectId, todoId }
}

const NOTES_BOARD_PREFIX = 'notes-board://'
export function isNotesBoardTab(path: string): boolean { return path.startsWith(NOTES_BOARD_PREFIX) }
export function buildNotesBoardPath(projectId: string): string { return NOTES_BOARD_PREFIX + projectId }
export function getNotesBoardProjectId(path: string): string { return path.slice(NOTES_BOARD_PREFIX.length) }

