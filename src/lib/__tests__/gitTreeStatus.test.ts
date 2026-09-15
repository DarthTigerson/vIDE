import { describe, it, expect } from 'vitest'
import { buildFileGitDecorations, buildFolderGitAggregates } from '../gitTreeStatus'
import type { GitStatus } from '@/types/index'

function status(staged: GitStatus['staged'], unstaged: GitStatus['unstaged']): GitStatus {
  return { staged, unstaged }
}

describe('buildFileGitDecorations', () => {
  it('joins a repo-relative status path with its own repo root', () => {
    const files = buildFileGitDecorations(
      ['/proj/repoA'],
      [status([], [{ path: 'src/App.tsx', status: 'M' }])],
    )
    expect(files.get('/proj/repoA/src/App.tsx')).toEqual({ code: 'M', letter: 'M', textClass: 'text-amber-400' })
  })

  it('maps each status code to the Git panel FileRow color convention', () => {
    const files = buildFileGitDecorations(
      ['/proj'],
      [status(
        [{ path: 'added.ts', status: 'A' }],
        [
          { path: 'deleted.ts', status: 'D' },
          { path: 'renamed.ts', status: 'R' },
          { path: 'new.ts', status: '?' },
        ],
      )],
    )
    expect(files.get('/proj/added.ts')?.textClass).toBe('text-green-400')
    expect(files.get('/proj/deleted.ts')?.textClass).toBe('text-red-400')
    expect(files.get('/proj/renamed.ts')?.textClass).toBe('text-blue-400')
    expect(files.get('/proj/new.ts')).toEqual({ code: '?', letter: 'U', textClass: 'text-fg-subtle' })
  })

  it('shows the working-tree status over the staged one when a file has both', () => {
    // Porcelain "AM": staged as added, then edited again before restaging.
    const files = buildFileGitDecorations(
      ['/proj'],
      [status(
        [{ path: 'both.ts', status: 'A' }],
        [{ path: 'both.ts', status: 'M' }],
      )],
    )
    expect(files.get('/proj/both.ts')?.code).toBe('M')
  })

  it('never lets one repo\'s status leak onto another repo\'s files with the same relative path', () => {
    const files = buildFileGitDecorations(
      ['/proj/repoA', '/proj/repoB'],
      [
        status([], [{ path: 'src/index.ts', status: 'M' }]),
        undefined,
      ],
    )
    expect(files.get('/proj/repoA/src/index.ts')?.code).toBe('M')
    expect(files.has('/proj/repoB/src/index.ts')).toBe(false)
  })

  it('skips repos with no loaded status yet without throwing', () => {
    const files = buildFileGitDecorations(['/proj/repoA'], [undefined])
    expect(files.size).toBe(0)
  })

  it('produces no decorations for a clean repo', () => {
    const files = buildFileGitDecorations(['/proj'], [status([], [])])
    expect(files.size).toBe(0)
  })
})

describe('buildFolderGitAggregates', () => {
  it('marks every ancestor folder of a changed file, stopping at the repo root', () => {
    const files = buildFileGitDecorations(['/proj/repoA'], [status([], [{ path: 'src/deep/File.ts', status: 'M' }])])
    const folders = buildFolderGitAggregates(files)
    expect(folders.get('/proj/repoA/src/deep')?.code).toBe('M')
    expect(folders.get('/proj/repoA/src')?.code).toBe('M')
    expect(folders.get('/proj/repoA')?.code).toBe('M')
  })

  it('does not mark an unrelated sibling folder', () => {
    const files = buildFileGitDecorations(['/proj'], [status([], [{ path: 'src/a/File.ts', status: 'M' }])])
    const folders = buildFolderGitAggregates(files)
    expect(folders.has('/proj/src/b')).toBe(false)
  })

  it('picks the higher-priority status when a folder contains more than one kind of change', () => {
    const files = buildFileGitDecorations(
      ['/proj'],
      [status(
        [],
        [
          { path: 'src/untracked.ts', status: '?' },
          { path: 'src/modified.ts', status: 'M' },
        ],
      )],
    )
    const folders = buildFolderGitAggregates(files)
    expect(folders.get('/proj/src')?.code).toBe('M')
  })

  it('keeps each repo\'s aggregate scoped to its own subtree in a multi-repo project', () => {
    const files = buildFileGitDecorations(
      ['/proj/repoA', '/proj/repoB'],
      [
        status([], [{ path: 'File.ts', status: 'M' }]),
        status([], []),
      ],
    )
    const folders = buildFolderGitAggregates(files)
    expect(folders.get('/proj/repoA')?.code).toBe('M')
    expect(folders.has('/proj/repoB')).toBe(false)
    // The shared project root above both repos is also marked, since it is
    // an ancestor of the one changed file.
    expect(folders.get('/proj')?.code).toBe('M')
  })

  it('produces no folder aggregates when there are no changed files', () => {
    const folders = buildFolderGitAggregates(new Map())
    expect(folders.size).toBe(0)
  })
})
