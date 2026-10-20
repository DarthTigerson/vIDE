import { describe, it, expect } from 'vitest'
import { formatMemory, memoryRows } from '../memoryBreakdown'

const MB = 1024 ** 2

describe('memoryRows', () => {
  it('lists vIDE, a numbered Claude row per session with its colour, then terminals and language servers', () => {
    const { totalBytes, rows } = memoryRows(
      {
        appBytes: 1000 * MB,
        sessions: [
          { instanceId: 'a', projectRoot: '/Users/t/Documents/vIDE', hue: '#saved', bytes: 650 * MB },
          { instanceId: 'b', projectRoot: '/Users/t/Documents/sqladmin', hue: '#other', bytes: 170 * MB },
          { instanceId: 'c', projectRoot: '/Users/t/Documents/api', hue: '#c', name: 'Auth fix', bytes: 0 },
        ],
        terminalsBytes: 20 * MB,
        languageServersBytes: 70 * MB,
        autocompleteBytes: 1900 * MB,
      },
      { a: '#live' }
    )
    expect(rows.map((r) => [r.label, r.hue])).toEqual([
      ['vIDE', '#A8B95C'],
      ['Claude', '#live'],
      ['Claude 2', '#other'],
      ['Claude 3', '#c'],
      ['Terminals', '#7F8CA8'],
      ['Language servers', '#A08670'],
      ['vIDE Autocomplete', '#6FA8B8'],
    ])
    expect(totalBytes).toBe(3810 * MB)
  })

  it('hides terminal, language-server and autocomplete rows when nothing is running', () => {
    const { rows } = memoryRows({ appBytes: 1, sessions: [], terminalsBytes: 0, languageServersBytes: 0, autocompleteBytes: 0 }, {})
    expect(rows.map((r) => r.key)).toEqual(['app'])
  })
})

describe('formatMemory', () => {
  it('uses MB below a gigabyte and one-decimal GB above', () => {
    expect(formatMemory(650 * MB)).toBe('650 MB')
    expect(formatMemory(1.94 * 1024 * MB)).toBe('1.9 GB')
  })
})
