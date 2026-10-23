/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import type { SearchHit } from '../../../../electron/searchTypes'
import { SearchPanel } from '../SearchPanel'
import { useGlobalSearchStore } from '@/stores/globalSearchStore'
import { useFileStore } from '@/stores/fileStore'
import { useEditorStore } from '@/stores/editorStore'
import { useTreeHidingStore } from '@/stores/treeHidingStore'
import { DEFAULT_HIDE_RULES, repoKey } from '@/lib/treeHiding'

function hit(path: string, line: number): SearchHit {
  return { path, line, col: 7, length: 6, text: 'const needle = 1', matchStart: 6 }
}

beforeEach(() => {
  try { localStorage.clear() } catch {}
  Element.prototype.scrollIntoView = vi.fn()
  ;(global as any).window.api = {
    searchStart: vi.fn(),
    searchCancel: vi.fn(),
    onSearchResults: vi.fn(() => () => {}),
    onSearchDone: vi.fn(() => () => {}),
    onFsChanged: vi.fn(() => () => {}),
    readFile: vi.fn().mockResolvedValue('const needle = 1\n'),
    readDir: vi.fn().mockResolvedValue([]),
  }
  useTreeHidingStore.setState({ byRepo: {} })
  useGlobalSearchStore.getState().clear()
  useGlobalSearchStore.setState({
    query: 'needle',
    status: 'done',
    groups: [
      { path: '/proj/src/a.ts', hits: [hit('/proj/src/a.ts', 3)], stale: false },
      { path: '/proj/b.log', hits: [hit('/proj/b.log', 1), hit('/proj/b.log', 2)], stale: false },
    ],
    matchCount: 3,
    collapsed: {},
    root: '/proj',
    searchId: 's-test',
  })
  useFileStore.setState({ projectRoot: '/proj' } as any)
  useEditorStore.setState({ tabs: [] })
})

afterEach(() => cleanup())

const fileName = (n: string) => screen.queryByText(n, { selector: 'span' })

describe('SearchPanel — Hidden results', () => {
  it('has no Hidden section when nothing is hidden', () => {
    render(<SearchPanel />)
    expect(screen.queryByRole('region', { name: 'Hidden results' })).toBeNull()
    expect(fileName('a.ts')).toBeInTheDocument()
    expect(fileName('b.log')).toBeInTheDocument()
  })

  it('moves rule-hidden files into a collapsed Hidden section with a count', () => {
    useTreeHidingStore.setState({ byRepo: { [repoKey('/proj')]: { ...DEFAULT_HIDE_RULES, extensions: ['log'] } } })
    render(<SearchPanel />)
    const section = screen.getByRole('region', { name: 'Hidden results' })
    const toggle = within(section).getByRole('button', { name: /^Hidden/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveTextContent('Hidden')
    expect(toggle).toHaveTextContent('1')
    expect(fileName('a.ts')).toBeInTheDocument()
    expect(fileName('b.log')).toBeNull()
  })

  it('expands on click, lists the hidden hits, and persists the open state', () => {
    useTreeHidingStore.setState({ byRepo: { [repoKey('/proj')]: { ...DEFAULT_HIDE_RULES, extensions: ['log'] } } })
    render(<SearchPanel />)
    const section = screen.getByRole('region', { name: 'Hidden results' })
    fireEvent.click(within(section).getByRole('button', { name: /^Hidden/ }))
    expect(within(section).getByText('b.log', { selector: 'span' })).toBeInTheDocument()
    expect(within(section).getByRole('button', { name: /^Hidden/ })).toHaveAttribute('aria-expanded', 'true')
    expect(localStorage.getItem('vide:general:searchHiddenOpen')).toBe('true')
    expect(screen.getAllByText('a.ts', { selector: 'span' })).toHaveLength(1)
  })

  it('starts expanded when previously opened', () => {
    localStorage.setItem('vide:general:searchHiddenOpen', 'true')
    useTreeHidingStore.setState({ byRepo: { [repoKey('/proj')]: { ...DEFAULT_HIDE_RULES, names: ['b.log'] } } })
    render(<SearchPanel />)
    const section = screen.getByRole('region', { name: 'Hidden results' })
    expect(within(section).getByText('b.log', { selector: 'span' })).toBeInTheDocument()
  })
})
