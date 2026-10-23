/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { HiddenItemsSettings } from '../HiddenItemsSettings'
import { useTreeHidingStore, GLOBAL_RULES_KEY } from '@/stores/treeHidingStore'
import { useFileStore } from '@/stores/fileStore'
import { useGraphifySettingsStore } from '@/stores/graphifySettingsStore'
import { DEFAULT_HIDE_RULES, type RepoHideRules } from '@/lib/treeHiding'

const rules = (over: Partial<RepoHideRules> = {}): RepoHideRules => ({ ...DEFAULT_HIDE_RULES, ...over })
const byRepo = () => useTreeHidingStore.getState().byRepo

beforeEach(() => {
  useTreeHidingStore.setState({ byRepo: {} })
  useFileStore.setState({ projectRoot: '/Users/me/vIDE' })
  useGraphifySettingsStore.setState({ enabled: true })
})

afterEach(() => cleanup())

function repoList() {
  return screen.getAllByRole('button', { pressed: undefined }).filter((b) => b.hasAttribute('aria-pressed'))
}

describe('HiddenItemsSettings — repo list', () => {
  it('lists All repos, the open repo, then others alphabetically, with counts', () => {
    useTreeHidingStore.setState({
      byRepo: {
        [GLOBAL_RULES_KEY]: rules({ names: ['a'] }),
        '~/zeta': rules({ names: ['x', 'y'] }),
        '~/alpha': rules({ extensions: ['log'] }),
        '~/vIDE': rules({ paths: ['p'], names: ['n'], extensions: ['e'] }),
      },
    })
    render(<HiddenItemsSettings />)
    expect(repoList().map((b) => b.textContent)).toEqual(['All repos1', 'vIDE3', 'alpha1', 'zeta2'])
  })

  it('selects the open repo by default', () => {
    render(<HiddenItemsSettings />)
    expect(screen.getByRole('button', { name: /^vIDE/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /^All repos/ })).toHaveAttribute('aria-pressed', 'false')
  })

  it('selects All repos when no project is open', () => {
    useFileStore.setState({ projectRoot: null })
    render(<HiddenItemsSettings />)
    expect(screen.getByRole('button', { name: /^All repos/ })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('HiddenItemsSettings — rules', () => {
  it('lists rules with type labels and a dotted extension', () => {
    useTreeHidingStore.setState({ byRepo: { '~/vIDE': rules({ paths: ['src/gen'], names: ['dist'], extensions: ['log'] }) } })
    render(<HiddenItemsSettings />)
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(within(items[0]).getByText('path')).toBeInTheDocument()
    expect(within(items[0]).getByText('src/gen')).toBeInTheDocument()
    expect(within(items[1]).getByText('name')).toBeInTheDocument()
    expect(within(items[1]).getByText('dist')).toBeInTheDocument()
    expect(within(items[2]).getByText('extension')).toBeInTheDocument()
    expect(within(items[2]).getByText('.log')).toBeInTheDocument()
  })

  it('shows "Nothing hidden." when empty', () => {
    render(<HiddenItemsSettings />)
    expect(screen.getByText('Nothing hidden.')).toBeInTheDocument()
  })

  it('× removes a rule', () => {
    useTreeHidingStore.setState({ byRepo: { '~/vIDE': rules({ names: ['dist', 'tmp'] }) } })
    render(<HiddenItemsSettings />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove dist' }))
    expect(byRepo()['~/vIDE'].names).toEqual(['tmp'])
  })
})

describe('HiddenItemsSettings — moving rules', () => {
  it('Make global moves a repo rule to All repos', () => {
    useTreeHidingStore.setState({ byRepo: { '~/vIDE': rules({ names: ['dist'] }) } })
    render(<HiddenItemsSettings />)
    fireEvent.click(screen.getByRole('button', { name: 'Make global' }))
    expect(byRepo()['~/vIDE'].names).toEqual([])
    expect(byRepo()[GLOBAL_RULES_KEY].names).toEqual(['dist'])
  })

  it('in All repos, "Only in vIDE" moves the rule to the open repo', () => {
    useTreeHidingStore.setState({ byRepo: { [GLOBAL_RULES_KEY]: rules({ extensions: ['log'] }) } })
    render(<HiddenItemsSettings />)
    fireEvent.click(screen.getByRole('button', { name: /^All repos/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Only in vIDE' }))
    expect(byRepo()[GLOBAL_RULES_KEY].extensions).toEqual([])
    expect(byRepo()['~/vIDE'].extensions).toEqual(['log'])
  })

  it('with no project open, All repos rows have no move button', () => {
    useFileStore.setState({ projectRoot: null })
    useTreeHidingStore.setState({ byRepo: { [GLOBAL_RULES_KEY]: rules({ names: ['dist'] }) } })
    render(<HiddenItemsSettings />)
    expect(screen.getByText('dist')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Only in|Make global/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Remove dist' })).toBeInTheDocument()
  })
})

describe('HiddenItemsSettings — Hide switches', () => {
  it('checked means hidden', () => {
    useTreeHidingStore.setState({ byRepo: { '~/vIDE': rules({ showDotfiles: false }) } })
    render(<HiddenItemsSettings />)
    expect(screen.getByRole('switch', { name: 'Hide dotfiles' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('switch', { name: 'Hide gitignored items' })).toHaveAttribute('aria-checked', 'false')
  })

  it('toggling calls through to the store', () => {
    render(<HiddenItemsSettings />)
    const sw = screen.getByRole('switch', { name: 'Hide dotfiles' })
    expect(sw).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(sw)
    expect(byRepo()['~/vIDE'].showDotfiles).toBe(false)
    expect(screen.getByRole('switch', { name: 'Hide dotfiles' })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('switch', { name: 'Hide dotfiles' }))
    expect(byRepo()['~/vIDE'].showDotfiles).toBe(true)
  })

  it('shows the Graphify output row only when graphify is enabled', () => {
    const { unmount } = render(<HiddenItemsSettings />)
    expect(screen.getByRole('switch', { name: 'Hide graphify output' })).toBeInTheDocument()
    unmount()
    useGraphifySettingsStore.setState({ enabled: false })
    render(<HiddenItemsSettings />)
    expect(screen.queryByRole('switch', { name: 'Hide graphify output' })).toBeNull()
  })

  it('is absent in the All repos view', () => {
    render(<HiddenItemsSettings />)
    fireEvent.click(screen.getByRole('button', { name: /^All repos/ }))
    expect(screen.queryAllByRole('switch')).toHaveLength(0)
  })
})

describe('HiddenItemsSettings — resets', () => {
  it('Reset vIDE confirms and deletes that key', () => {
    useTreeHidingStore.setState({ byRepo: { '~/vIDE': rules({ names: ['dist'] }), '~/other': rules({ names: ['a'] }) } })
    render(<HiddenItemsSettings />)
    fireEvent.click(screen.getByRole('button', { name: 'Reset vIDE' }))
    expect(byRepo()['~/vIDE']).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(byRepo()['~/vIDE']).toBeUndefined()
    expect(byRepo()['~/other']).toBeDefined()
  })

  it('cancelling the confirm keeps the rules', () => {
    useTreeHidingStore.setState({ byRepo: { '~/vIDE': rules({ names: ['dist'] }) } })
    render(<HiddenItemsSettings />)
    fireEvent.click(screen.getByRole('button', { name: 'Reset vIDE' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(byRepo()['~/vIDE']).toBeDefined()
  })

  it('resetting a non-open repo reselects All repos', () => {
    useTreeHidingStore.setState({ byRepo: { '~/other': rules({ names: ['a'] }) } })
    render(<HiddenItemsSettings />)
    fireEvent.click(screen.getByRole('button', { name: /^other/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Reset other' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(byRepo()['~/other']).toBeUndefined()
    expect(screen.getByRole('button', { name: /^All repos/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('Master Reset confirms and empties everything', () => {
    useTreeHidingStore.setState({ byRepo: { '~/vIDE': rules({ names: ['a'] }), [GLOBAL_RULES_KEY]: rules({ names: ['b'] }) } })
    render(<HiddenItemsSettings />)
    fireEvent.click(screen.getByRole('button', { name: 'Master Reset' }))
    expect(Object.keys(byRepo())).toHaveLength(2)
    const dialogButtons = screen.getAllByRole('button', { name: 'Master Reset' })
    fireEvent.click(dialogButtons[dialogButtons.length - 1])
    expect(byRepo()).toEqual({})
  })

  it('Master Reset is disabled when nothing is saved', () => {
    render(<HiddenItemsSettings />)
    expect(screen.getByRole('button', { name: 'Master Reset' })).toBeDisabled()
  })
})
