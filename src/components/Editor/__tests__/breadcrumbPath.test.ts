import { describe, it, expect } from 'vitest'
import { breadcrumbPathForTab, diffFilePathForTab, filePathForTab } from '../breadcrumbPath'
import { buildGitDiffPath, buildGitCommitDiffPath } from '@/components/Git/paths'
import { buildMarkdownPreviewPath, buildImagePreviewPath } from '@/components/Viewer/paths'
import { buildTerminalPath, GENERAL_SETTINGS_TAB_PATH } from '@/components/Settings/paths'

describe('breadcrumbPathForTab', () => {
  it('returns the tab path itself for a plain file tab', () => {
    expect(breadcrumbPathForTab('/proj/src/a.ts', true)).toBe('/proj/src/a.ts')
  })

  it('returns null for a non-file tab that has no path to show', () => {
    expect(breadcrumbPathForTab('git-log://x', false)).toBeNull()
  })

  it('returns the underlying file for a markdown preview tab', () => {
    expect(breadcrumbPathForTab(buildMarkdownPreviewPath('/proj/README.md'), false)).toBe('/proj/README.md')
  })

  it('joins repo root and relative path for a staged diff tab', () => {
    expect(breadcrumbPathForTab(buildGitDiffPath('/proj', 'src/a.ts', true), false)).toBe('/proj/src/a.ts')
  })

  it('joins repo root and relative path for an unstaged diff tab', () => {
    expect(breadcrumbPathForTab(buildGitDiffPath('/proj/repoB', 'src/a.ts', false), false)).toBe('/proj/repoB/src/a.ts')
  })

  it('joins repo root and relative path for a commit diff tab', () => {
    expect(breadcrumbPathForTab(buildGitCommitDiffPath('/proj', 'abc123', 'src/nested/a.ts'), false)).toBe(
      '/proj/src/nested/a.ts',
    )
  })

  it('does not double the slash when the repo root has a trailing slash', () => {
    expect(breadcrumbPathForTab(buildGitDiffPath('/proj/', 'src/a.ts', false), false)).toBe('/proj/src/a.ts')
  })
})

describe('diffFilePathForTab', () => {
  it('returns the absolute file for working-tree and commit diff tabs', () => {
    expect(diffFilePathForTab(buildGitDiffPath('/proj', 'src/a.ts', false))).toBe('/proj/src/a.ts')
    expect(diffFilePathForTab(buildGitCommitDiffPath('/proj', 'abc123', 'src/a.ts'))).toBe('/proj/src/a.ts')
  })

  it('returns null for every other kind of tab', () => {
    expect(diffFilePathForTab('/proj/src/a.ts')).toBeNull()
    expect(diffFilePathForTab(buildMarkdownPreviewPath('/proj/README.md'))).toBeNull()
    expect(diffFilePathForTab(buildTerminalPath('x'))).toBeNull()
  })
})

describe('filePathForTab', () => {
  it('returns a plain file tab path as-is', () => {
    expect(filePathForTab('/proj/src/a.ts')).toBe('/proj/src/a.ts')
  })

  it('unwraps diff, markdown preview and image preview tabs to their real file', () => {
    expect(filePathForTab(buildGitDiffPath('/proj', 'src/a.ts', true))).toBe('/proj/src/a.ts')
    expect(filePathForTab(buildGitCommitDiffPath('/proj', 'abc123', 'src/a.ts'))).toBe('/proj/src/a.ts')
    expect(filePathForTab(buildMarkdownPreviewPath('/proj/README.md'))).toBe('/proj/README.md')
    expect(filePathForTab(buildImagePreviewPath('/proj/logo.png'))).toBe('/proj/logo.png')
  })

  it('returns null for tabs that are not a file (terminals, settings pages)', () => {
    expect(filePathForTab(buildTerminalPath('x'))).toBeNull()
    expect(filePathForTab(GENERAL_SETTINGS_TAB_PATH)).toBeNull()
  })
})
