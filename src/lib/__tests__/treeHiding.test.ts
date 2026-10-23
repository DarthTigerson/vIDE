import { describe, it, expect } from 'vitest'
import {
  DEFAULT_HIDE_RULES,
  extensionOf,
  isRuleHidden,
  isSearchHidden,
  isTreeVisible,
  relativePath,
  removeRulesFor,
  repoKey,
  ruleCount,
  type RepoHideRules,
} from '../treeHiding'

const rules = (over: Partial<RepoHideRules>): RepoHideRules => ({ ...DEFAULT_HIDE_RULES, ...over })

describe('treeHiding', () => {
  it('keys a repo the same on macOS and Linux', () => {
    expect(repoKey('/Users/thomas/Documents/vIDE')).toBe('~/Documents/vIDE')
    expect(repoKey('/home/thomas/Documents/vIDE')).toBe('~/Documents/vIDE')
    expect(repoKey('/opt/repo')).toBe('/opt/repo')
    expect(repoKey('/Users/thomasx2/repo')).toBe('~/repo')
  })

  it('makes paths repo-relative', () => {
    expect(relativePath('/r', '/r/src/a.ts')).toBe('src/a.ts')
    expect(relativePath('/r', '/r')).toBe('')
    expect(relativePath('/r', '/rx/a.ts')).toBeNull()
  })

  it('reads extensions, skipping bare dotfiles', () => {
    expect(extensionOf('a.test.ts')).toBe('ts')
    expect(extensionOf('.env')).toBeNull()
    expect(extensionOf('Makefile')).toBeNull()
    expect(extensionOf('trailing.')).toBeNull()
  })

  it('hides by path (and everything under it), name on any segment, and file extension', () => {
    const r = rules({ paths: ['dist'], names: ['node_modules'], extensions: ['json'] })
    expect(isRuleHidden('dist', true, r)).toBe(true)
    expect(isRuleHidden('dist/index.js', false, r)).toBe(true)
    expect(isRuleHidden('distro', true, r)).toBe(false)
    expect(isRuleHidden('packages/a/node_modules', true, r)).toBe(true)
    expect(isRuleHidden('package.json', false, r)).toBe(true)
    expect(isRuleHidden('config.json', true, r)).toBe(false)
    expect(isRuleHidden('src/App.tsx', false, r)).toBe(false)
  })

  it('applies the SHOW switches in the tree', () => {
    const hidden = rules({ paths: ['dist'] })
    expect(isTreeVisible('dist', true, false, hidden, false)).toBe(false)
    expect(isTreeVisible('dist', true, false, { ...hidden, showHidden: true }, false)).toBe(true)
    expect(isTreeVisible('out', true, true, rules({ showGitignored: false }), false)).toBe(false)
    expect(isTreeVisible('out', true, true, DEFAULT_HIDE_RULES, false)).toBe(true)
    expect(isTreeVisible('src/.env', false, false, rules({ showDotfiles: false }), false)).toBe(false)
    expect(isTreeVisible('graphify-out', true, false, rules({ showGraphify: false }), true)).toBe(false)
    // The Graphify switch only applies while Graphify is enabled.
    expect(isTreeVisible('graphify-out', true, false, rules({ showGraphify: false }), false)).toBe(true)
  })

  it('marks search results hidden by a rule or a switch, but not by gitignore', () => {
    expect(isSearchHidden('dist/a.js', rules({ paths: ['dist'] }), false)).toBe(true)
    expect(isSearchHidden('.claude/notes.md', rules({ showDotfiles: false }), false)).toBe(true)
    expect(isSearchHidden('graphify-out/GRAPH_REPORT.md', rules({ showGraphify: false }), true)).toBe(true)
    expect(isSearchHidden('src/a.ts', rules({ showGitignored: false }), false)).toBe(false)
  })

  it('unhide drops every rule that hides the item, and only those', () => {
    const r = rules({ paths: ['src', 'dist'], names: ['lib', 'tmp'], extensions: ['ts', 'md'] })
    const after = removeRulesFor('src/lib/a.ts', false, r)
    expect(after.paths).toEqual(['dist'])
    expect(after.names).toEqual(['tmp'])
    expect(after.extensions).toEqual(['md'])
    expect(ruleCount(after)).toBe(3)
  })
})
