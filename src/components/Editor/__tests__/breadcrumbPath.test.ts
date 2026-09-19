import { describe, it, expect } from 'vitest'
import { breadcrumbPathForTab } from '../breadcrumbPath'
import { buildGitDiffPath, buildGitCommitDiffPath } from '@/components/Git/paths'
import { buildMarkdownPreviewPath } from '@/components/Viewer/paths'

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
