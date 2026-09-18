import { describe, it, expect } from 'vitest'
import { buildLiveToHeadLineMap } from '../blameLineMap'

describe('buildLiveToHeadLineMap', () => {
  it('maps every line 1:1 when the file is unchanged', () => {
    const content = 'a\nb\nc\n'
    const map = buildLiveToHeadLineMap(content, content)
    expect(map.get(1)).toEqual({ kind: 'clean', headLine: 1 })
    expect(map.get(2)).toEqual({ kind: 'clean', headLine: 2 })
    expect(map.get(3)).toEqual({ kind: 'clean', headLine: 3 })
  })

  it('offsets later clean lines after a pure addition', () => {
    const head = 'a\nb\nc\n'
    const live = 'a\nNEW1\nNEW2\nb\nc\n'
    const map = buildLiveToHeadLineMap(head, live)
    expect(map.get(1)).toEqual({ kind: 'clean', headLine: 1 })
    expect(map.get(2)).toEqual({ kind: 'uncommitted' })
    expect(map.get(3)).toEqual({ kind: 'uncommitted' })
    expect(map.get(4)).toEqual({ kind: 'clean', headLine: 2 })
    expect(map.get(5)).toEqual({ kind: 'clean', headLine: 3 })
  })

  it('offsets later clean lines after a pure deletion', () => {
    const head = 'a\nb\nc\nd\n'
    const live = 'a\nd\n'
    const map = buildLiveToHeadLineMap(head, live)
    expect(map.get(1)).toEqual({ kind: 'clean', headLine: 1 })
    expect(map.get(2)).toEqual({ kind: 'clean', headLine: 4 })
  })

  it('marks a modified region uncommitted and correctly offsets lines after it, even when sizes differ', () => {
    const head = 'a\nb\nc\nd\n'
    const live = 'a\nX\nY\nZ\nd\n'
    const map = buildLiveToHeadLineMap(head, live)
    expect(map.get(1)).toEqual({ kind: 'clean', headLine: 1 })
    expect(map.get(2)).toEqual({ kind: 'uncommitted' })
    expect(map.get(3)).toEqual({ kind: 'uncommitted' })
    expect(map.get(4)).toEqual({ kind: 'uncommitted' })
    expect(map.get(5)).toEqual({ kind: 'clean', headLine: 4 })
  })

  it('returns an empty map for two empty files', () => {
    const map = buildLiveToHeadLineMap('', '')
    expect(map.size).toBe(0)
  })

  // Regression case for the bug this replaces: the old whole-file
  // annotator placed decorations using HEAD's line numbers directly on the
  // live buffer, so lines added past HEAD's original line count were
  // either dropped or attributed to the wrong commit. Here they must show
  // up as 'uncommitted', not silently missing and not mapped to some
  // unrelated headLine.
  it('marks lines appended past the end of the file as uncommitted rather than dropping or mis-mapping them', () => {
    const head = 'a\nb\n'
    const live = 'a\nb\nc\nd\ne\n'
    const map = buildLiveToHeadLineMap(head, live)
    expect(map.get(1)).toEqual({ kind: 'clean', headLine: 1 })
    expect(map.get(2)).toEqual({ kind: 'clean', headLine: 2 })
    expect(map.get(3)).toEqual({ kind: 'uncommitted' })
    expect(map.get(4)).toEqual({ kind: 'uncommitted' })
    expect(map.get(5)).toEqual({ kind: 'uncommitted' })
  })
})
