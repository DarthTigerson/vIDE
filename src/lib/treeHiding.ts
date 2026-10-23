// Site Tree hiding rules for one repo, set from the tree's right-click Hide
// submenu. Paths are repo-relative; names match any path segment; extensions
// (stored without the dot) match file names only.
export interface RepoHideRules {
  paths: string[]
  names: string[]
  extensions: string[]
  showHidden: boolean
  showGitignored: boolean
  showDotfiles: boolean
  showGraphify: boolean
}

export type HideToggle = 'showHidden' | 'showGitignored' | 'showDotfiles' | 'showGraphify'

export const DEFAULT_HIDE_RULES: RepoHideRules = {
  paths: [],
  names: [],
  extensions: [],
  showHidden: false,
  showGitignored: true,
  showDotfiles: true,
  showGraphify: true,
}

export const GRAPHIFY_OUT_DIR = 'graphify-out'

// The same repo on macOS (/Users/me/…) and Linux (/home/me/…) shares one
// entry, so vIDE Sync carries the rules between machines.
export function repoKey(root: string): string {
  return root.replace(/^\/(Users|home)\/[^/]+(?=\/|$)/, '~')
}

export function relativePath(root: string, path: string): string | null {
  if (path === root) return ''
  return path.startsWith(root + '/') ? path.slice(root.length + 1) : null
}

// "foo.test.ts" → "ts"; dotfiles with no other dot (".env") and names with no
// dot have no extension.
export function extensionOf(name: string): string | null {
  const dot = name.lastIndexOf('.')
  return dot > 0 && dot < name.length - 1 ? name.slice(dot + 1) : null
}

function segments(rel: string): string[] {
  return rel.split('/').filter(Boolean)
}

// Hidden by one of the user's own rules: the path or an ancestor, a name on
// any segment, or (for a file) its extension.
export function isRuleHidden(rel: string, isDirectory: boolean, rules: RepoHideRules): boolean {
  if (rules.paths.some((p) => rel === p || rel.startsWith(p + '/'))) return true
  const parts = segments(rel)
  if (parts.some((part) => rules.names.includes(part))) return true
  const ext = isDirectory ? null : extensionOf(parts[parts.length - 1] ?? '')
  return ext !== null && rules.extensions.includes(ext)
}

function isDotPath(rel: string): boolean {
  return segments(rel).some((part) => part.startsWith('.'))
}

function isGraphifyPath(rel: string): boolean {
  return segments(rel)[0] === GRAPHIFY_OUT_DIR
}

// Hidden by a SHOW switch other than gitignored (which needs git's state, so
// the tree checks it itself). graphifyEnabled false = the Graphify switch
// doesn't apply.
function hiddenBySwitch(rel: string, rules: RepoHideRules, graphifyEnabled: boolean): boolean {
  if (!rules.showDotfiles && isDotPath(rel)) return true
  return graphifyEnabled && !rules.showGraphify && isGraphifyPath(rel)
}

export function isTreeVisible(
  rel: string,
  isDirectory: boolean,
  gitignored: boolean,
  rules: RepoHideRules,
  graphifyEnabled: boolean,
): boolean {
  if (!rules.showHidden && isRuleHidden(rel, isDirectory, rules)) return false
  if (!rules.showGitignored && gitignored) return false
  return !hiddenBySwitch(rel, rules, graphifyEnabled)
}

// Search keeps hidden files but lists them in its own Hidden section.
export function isSearchHidden(rel: string, rules: RepoHideRules, graphifyEnabled: boolean): boolean {
  return isRuleHidden(rel, false, rules) || hiddenBySwitch(rel, rules, graphifyEnabled)
}

// Unhide: drops every rule that hides this item.
export function removeRulesFor(rel: string, isDirectory: boolean, rules: RepoHideRules): RepoHideRules {
  const parts = segments(rel)
  const ext = isDirectory ? null : extensionOf(parts[parts.length - 1] ?? '')
  return {
    ...rules,
    paths: rules.paths.filter((p) => !(rel === p || rel.startsWith(p + '/'))),
    names: rules.names.filter((n) => !parts.includes(n)),
    extensions: rules.extensions.filter((e) => e !== ext),
  }
}

export function ruleCount(rules: RepoHideRules): number {
  return rules.paths.length + rules.names.length + rules.extensions.length
}
