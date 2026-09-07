import type { ReactNode } from 'react'
import { useEditorStore } from '@/stores/editorStore'
import { useGeneralSettingsStore } from '@/stores/generalSettingsStore'
import { getBiggestPaneId } from '@/lib/paneLayout'
import {
  GENERAL_SETTINGS_TAB_PATH, DISPLAY_TAB_PATH, EDITOR_SETTINGS_TAB_PATH, GIT_SETTINGS_TAB_PATH,
  BROWSER_SETTINGS_TAB_PATH, CLAUDE_SETTINGS_TAB_PATH, BRIDGE_SETTINGS_TAB_PATH, GRAPHIFY_SETTINGS_TAB_PATH,
  JIRA_SETTINGS_TAB_PATH, DOCKER_SETTINGS_TAB_PATH, MOBILE_SETTINGS_TAB_PATH, NOTES_SETTINGS_TAB_PATH,
  TODO_SETTINGS_TAB_PATH,
} from './paths'
import {
  SettingsIcon, EditorIcon, DisplaySettingsIcon, ClaudeIcon, BridgeIcon, GitIcon, DockerIcon,
  BrowserIcon, JiraIcon, GraphIcon, PhoneIcon, NotesIcon, TodoIcon,
} from '@/components/ActivityBar/ActivityBar'

interface NavItem {
  path: string
  label: string
  icon: ReactNode
}

interface NavGroup {
  label: string
  items: NavItem[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'General',
    items: [
      { path: GENERAL_SETTINGS_TAB_PATH, label: 'General', icon: <SettingsIcon /> },
      { path: EDITOR_SETTINGS_TAB_PATH, label: 'Editor', icon: <EditorIcon /> },
      { path: DISPLAY_TAB_PATH, label: 'Display', icon: <DisplaySettingsIcon /> },
    ],
  },
  {
    label: 'Models',
    items: [
      { path: CLAUDE_SETTINGS_TAB_PATH, label: 'Claude', icon: <ClaudeIcon /> },
      { path: BRIDGE_SETTINGS_TAB_PATH, label: 'Bridge', icon: <BridgeIcon /> },
    ],
  },
  {
    label: 'Source Control',
    items: [
      { path: GIT_SETTINGS_TAB_PATH, label: 'Git', icon: <GitIcon /> },
      { path: DOCKER_SETTINGS_TAB_PATH, label: 'Docker', icon: <DockerIcon /> },
    ],
  },
  {
    label: 'Integrations',
    items: [
      { path: BROWSER_SETTINGS_TAB_PATH, label: 'Browser', icon: <BrowserIcon /> },
      { path: GRAPHIFY_SETTINGS_TAB_PATH, label: 'Graphify', icon: <GraphIcon /> },
      { path: MOBILE_SETTINGS_TAB_PATH, label: 'Mobile', icon: <PhoneIcon /> },
    ],
  },
  {
    label: 'Productivity',
    items: [
      { path: NOTES_SETTINGS_TAB_PATH, label: 'Notes', icon: <NotesIcon /> },
      { path: TODO_SETTINGS_TAB_PATH, label: 'To Do', icon: <TodoIcon /> },
      { path: JIRA_SETTINGS_TAB_PATH, label: 'Jira', icon: <JiraIcon /> },
    ],
  },
]

export function SettingsPanel() {
  const activeTabPath = useEditorStore((s) => s.activeTabPath)

  return (
    <div className="h-full flex flex-col bg-sidebar border-r border-border overflow-hidden">
      <div className="h-9 px-3 border-b border-border shrink-0 flex items-center">
        <span className="text-xs font-semibold text-fg-muted uppercase tracking-wider truncate">
          Settings
        </span>
      </div>
      <div className="flex-1 overflow-auto py-1">
        {NAV_GROUPS.map((group, i) => (
          <div key={group.label} className={i === 0 ? '' : 'mt-2'}>
            <div className="px-3 pb-0.5">
              <span className="text-[0.6875rem] font-semibold text-fg-subtle uppercase tracking-wider">
                {group.label}
              </span>
            </div>
            {group.items.map((item) => {
              const isActive = activeTabPath === item.path
              return (
                <button
                  key={item.path}
                  type="button"
                  onClick={() => {
                    const tab = { path: item.path, content: '', dirty: false }
                    if (useGeneralSettingsStore.getState().openInBiggestPane) {
                      const biggestPaneId = getBiggestPaneId()
                      if (biggestPaneId) {
                        useEditorStore.getState().openTabInPane(tab, biggestPaneId)
                        return
                      }
                    }
                    useEditorStore.getState().openTab(tab)
                  }}
                  className={[
                    'w-full flex items-center gap-2 text-left pl-7 pr-3 py-1 text-sm transition-colors',
                    isActive ? 'bg-accent/10 text-fg' : 'text-fg hover:bg-white/5',
                  ].join(' ')}
                >
                  <span
                    className={[
                      'shrink-0 [&>svg]:w-4 [&>svg]:h-4',
                      isActive ? 'opacity-100' : 'opacity-60',
                    ].join(' ')}
                  >
                    {item.icon}
                  </span>
                  <span className="truncate">{item.label}</span>
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
