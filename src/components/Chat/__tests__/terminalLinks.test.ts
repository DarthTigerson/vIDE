import { describe, it, expect } from 'vitest'
import { FILE_PATH_REGEX, parseFileLink, resolveFileLinkPath, looksLikeBareDomain } from '../terminalLinks'

function match(text: string): string | null {
  const m = text.match(FILE_PATH_REGEX)
  return m ? m[0] : null
}

describe('FILE_PATH_REGEX', () => {
  it('matches a bare relative path', () => {
    expect(match('see src/App.tsx for details')).toBe('src/App.tsx')
  })

  it('matches a deeply nested relative path with hyphens and digits', () => {
    expect(match('docs/superpowers/specs/2026-08-14-multi-git-repo-support-design.md')).toBe(
      'docs/superpowers/specs/2026-08-14-multi-git-repo-support-design.md'
    )
  })

  it('matches an absolute path', () => {
    expect(match('open /Users/thomasbonnici/Documents/vIDE/src/App.tsx now')).toBe(
      '/Users/thomasbonnici/Documents/vIDE/src/App.tsx'
    )
  })

  it('matches a filename with multiple dots', () => {
    expect(match('src/next.config.mjs')).toBe('src/next.config.mjs')
  })

  it('matches a trailing line number', () => {
    expect(match('src/App.tsx:42')).toBe('src/App.tsx:42')
  })

  it('matches trailing line and column numbers', () => {
    expect(match('src/App.tsx:42:10')).toBe('src/App.tsx:42:10')
  })

  it('matches an extensionless file inside a dotfile directory (regression: SSH keys, Makefile, LICENSE, etc.)', () => {
    expect(match('~/.ssh/id_ed25519_github_personal')).toBe('~/.ssh/id_ed25519_github_personal')
  })

  it('matches an extensionless relative path', () => {
    expect(match('scripts/Makefile')).toBe('scripts/Makefile')
  })

  it('does not match a bare filename with no directory separator', () => {
    expect(match('rename App.tsx please')).toBeNull()
  })

  it('does not match ordinary prose that merely contains a dot', () => {
    expect(match('e.g. this works')).toBeNull()
    expect(match('v1.2.3')).toBeNull()
  })

  it('also matches a scheme-less domain path (handled by looksLikeBareDomain at click time, not filtered here)', () => {
    expect(match('Go to github.com/settings/ssh/new')).toBe('github.com/settings/ssh/new')
  })
})

describe('looksLikeBareDomain', () => {
  it('recognizes a scheme-less domain path (the reported bug: clicking it did nothing)', () => {
    expect(looksLikeBareDomain('github.com/settings/ssh/new')).toBe(true)
  })

  it('recognizes a multi-label domain', () => {
    expect(looksLikeBareDomain('api.example.com/v1/users')).toBe(true)
  })

  it('rejects a relative path with no dot in its first segment', () => {
    expect(looksLikeBareDomain('src/App.tsx')).toBe(false)
  })

  it('rejects an absolute path', () => {
    expect(looksLikeBareDomain('/etc/hosts')).toBe(false)
  })

  it('rejects a home-relative path', () => {
    expect(looksLikeBareDomain('~/.ssh/id_ed25519')).toBe(false)
  })

  it('rejects a dotfile directory (leading dot, not a domain label)', () => {
    expect(looksLikeBareDomain('.ssh/config')).toBe(false)
  })
})

describe('parseFileLink', () => {
  it('parses a bare path with no line/col', () => {
    expect(parseFileLink('src/App.tsx')).toEqual({ path: 'src/App.tsx', line: undefined, col: undefined })
  })

  it('parses a path with a line number', () => {
    expect(parseFileLink('src/App.tsx:42')).toEqual({ path: 'src/App.tsx', line: 42, col: undefined })
  })

  it('parses a path with a line and column number', () => {
    expect(parseFileLink('src/App.tsx:42:10')).toEqual({ path: 'src/App.tsx', line: 42, col: 10 })
  })
})

describe('resolveFileLinkPath', () => {
  it('returns an absolute path unchanged', () => {
    expect(resolveFileLinkPath('/etc/hosts', '/Users/thomas/project', '/Users/thomas')).toBe('/etc/hosts')
  })

  it('resolves a relative path against the project root', () => {
    expect(resolveFileLinkPath('src/App.tsx', '/Users/thomas/project', '/Users/thomas')).toBe(
      '/Users/thomas/project/src/App.tsx'
    )
  })

  it('handles a project root with a trailing slash', () => {
    expect(resolveFileLinkPath('src/App.tsx', '/Users/thomas/project/', '/Users/thomas')).toBe(
      '/Users/thomas/project/src/App.tsx'
    )
  })

  it('expands a home-relative path against the home directory, not the project root', () => {
    expect(resolveFileLinkPath('~/.ssh/id_ed25519_github_personal', '/Users/thomas/project', '/Users/thomas')).toBe(
      '/Users/thomas/.ssh/id_ed25519_github_personal'
    )
  })

  it('handles a home directory with a trailing slash', () => {
    expect(resolveFileLinkPath('~/.ssh/id_ed25519', '/Users/thomas/project', '/Users/thomas/')).toBe(
      '/Users/thomas/.ssh/id_ed25519'
    )
  })

  it('falls back to joining against the project root when no home directory is available', () => {
    expect(resolveFileLinkPath('~/.ssh/id_ed25519', '/Users/thomas/project', null)).toBe(
      '/Users/thomas/project/~/.ssh/id_ed25519'
    )
  })
})
