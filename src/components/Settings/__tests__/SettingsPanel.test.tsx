/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { SettingsPanel } from '../SettingsPanel'
import { useEditorStore } from '@/stores/editorStore'
import {
  GENERAL_SETTINGS_TAB_PATH, DISPLAY_TAB_PATH, EDITOR_SETTINGS_TAB_PATH, GIT_SETTINGS_TAB_PATH,
  BROWSER_SETTINGS_TAB_PATH, CLAUDE_SETTINGS_TAB_PATH, BRIDGE_SETTINGS_TAB_PATH, GRAPHIFY_SETTINGS_TAB_PATH,
  JIRA_SETTINGS_TAB_PATH, DOCKER_SETTINGS_TAB_PATH, MOBILE_SETTINGS_TAB_PATH, NOTES_SETTINGS_TAB_PATH,
  TODO_SETTINGS_TAB_PATH,
} from '../paths'

const ITEMS: { label: string; path: string }[] = [
  { label: 'General', path: GENERAL_SETTINGS_TAB_PATH },
  { label: 'Editor', path: EDITOR_SETTINGS_TAB_PATH },
  { label: 'Display', path: DISPLAY_TAB_PATH },
  { label: 'Claude', path: CLAUDE_SETTINGS_TAB_PATH },
  { label: 'Bridge', path: BRIDGE_SETTINGS_TAB_PATH },
  { label: 'Git', path: GIT_SETTINGS_TAB_PATH },
  { label: 'Docker', path: DOCKER_SETTINGS_TAB_PATH },
  { label: 'Browser', path: BROWSER_SETTINGS_TAB_PATH },
  { label: 'Jira', path: JIRA_SETTINGS_TAB_PATH },
  { label: 'Graphify', path: GRAPHIFY_SETTINGS_TAB_PATH },
  { label: 'Mobile', path: MOBILE_SETTINGS_TAB_PATH },
  { label: 'Notes', path: NOTES_SETTINGS_TAB_PATH },
  { label: 'To Do', path: TODO_SETTINGS_TAB_PATH },
]

afterEach(() => {
  cleanup()
  useEditorStore.setState({ tabs: [], activeTabPath: null })
})

describe('SettingsPanel', () => {
  it('renders every settings item grouped under a section label', () => {
    render(<SettingsPanel />)
    for (const { label } of ITEMS) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy()
    }
    // 'General' is both a group label and an item label, so it appears twice.
    expect(screen.getAllByText('General')).toHaveLength(2)
    for (const group of ['Models', 'Source Control', 'Integrations', 'Productivity']) {
      expect(screen.getByText(group)).toBeTruthy()
    }
  })

  it.each(ITEMS)('opens the correct tab for $label', ({ label, path }) => {
    render(<SettingsPanel />)
    fireEvent.click(screen.getByRole('button', { name: label }))
    expect(useEditorStore.getState().activeTabPath).toBe(path)
  })
})
