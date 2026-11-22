import type { ReactNode } from 'react'
import { useEditorStore } from '@/stores/editorStore'
import {
  GENERAL_SETTINGS_TAB_PATH, DISPLAY_TAB_PATH, EDITOR_SETTINGS_TAB_PATH, GIT_SETTINGS_TAB_PATH, FILE_TREE_SETTINGS_TAB_PATH,
  BROWSER_SETTINGS_TAB_PATH, CLAUDE_SETTINGS_TAB_PATH, BRIDGE_SETTINGS_TAB_PATH, GRAPHIFY_SETTINGS_TAB_PATH,
  MOBILE_SETTINGS_TAB_PATH, NOTES_SETTINGS_TAB_PATH, SCRIPTS_SETTINGS_TAB_PATH,
  TODO_SETTINGS_TAB_PATH, LLAMA_SETTINGS_TAB_PATH, ABOUT_SETTINGS_TAB_PATH, STORE_SETTINGS_TAB_PATH, AGENT_TOOLING_SETTINGS_TAB_PATH, SOUND_SETTINGS_TAB_PATH, buildAppSettingsPath,
} from './paths'
import { useAppContribStore } from '@/apps/appContribStore'
import { StoreBagIcon } from '@/components/Store/storeUi'
import { DoneModeIcon } from '@/components/ActivityBar/DoneModeMenu'
import {
  SettingsIcon, EditorIcon, DisplaySettingsIcon, FilesIcon, ClaudeIcon, BridgeIcon, GitIcon,
  BrowserIcon, GraphIcon, PhoneIcon, NotesIcon, ScriptsIcon, TodoIcon, LlamaIcon, McpIcon,
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
      { path: FILE_TREE_SETTINGS_TAB_PATH, label: 'Site Tree', icon: <FilesIcon /> },
      { path: SOUND_SETTINGS_TAB_PATH, label: 'Sound & Voice', icon: <DoneModeIcon mode="sound" /> },
      { path: ABOUT_SETTINGS_TAB_PATH, label: 'About', icon: <AboutIcon /> },
    ],
  },
  {
    label: 'Models',
    items: [
      { path: CLAUDE_SETTINGS_TAB_PATH, label: 'Claude', icon: <ClaudeIcon /> },
      { path: BRIDGE_SETTINGS_TAB_PATH, label: 'Bridge', icon: <BridgeIcon /> },
      { path: LLAMA_SETTINGS_TAB_PATH, label: 'Llama', icon: <LlamaIcon /> },
    ],
  },
  {
    label: 'Source Control',
    items: [
      { path: GIT_SETTINGS_TAB_PATH, label: 'Git', icon: <GitIcon /> },
    ],
  },
  {
    label: 'Integrations',
    items: [
      { path: AGENT_TOOLING_SETTINGS_TAB_PATH, label: 'Agent Tooling', icon: <McpIcon /> },
      { path: BROWSER_SETTINGS_TAB_PATH, label: 'Browser', icon: <BrowserIcon /> },
      { path: GRAPHIFY_SETTINGS_TAB_PATH, label: 'Graphify', icon: <GraphIcon /> },
      { path: MOBILE_SETTINGS_TAB_PATH, label: 'Mobile', icon: <PhoneIcon /> },
      { path: STORE_SETTINGS_TAB_PATH, label: 'Store', icon: <StoreBagIcon size={16} /> },
    ],
  },
  {
    label: 'Productivity',
    items: [
      { path: NOTES_SETTINGS_TAB_PATH, label: 'Notes', icon: <NotesIcon /> },
      { path: SCRIPTS_SETTINGS_TAB_PATH, label: 'Scripts', icon: <ScriptsIcon /> },
      { path: TODO_SETTINGS_TAB_PATH, label: 'To Do', icon: <TodoIcon /> },
    ],
  },
]

export function SettingsPanel() {
  const activeTabPath = useEditorStore((s) => s.activeTabPath)
  const appSettingsPages = useAppContribStore((s) => s.settingsPages)
  const appPanels = useAppContribStore((s) => s.panels)
  // One row per store app that registered a settings page, under the built-ins.
  const appItems = Object.values(appSettingsPages).map((page) => {
    const PanelIcon = appPanels[page.appId]?.icon
    return { path: buildAppSettingsPath(page.appId), label: page.title, icon: PanelIcon ? <PanelIcon /> : <StoreBagIcon size={16} /> }
  })
  const navGroups = appItems.length > 0 ? [...NAV_GROUPS, { label: 'Apps', items: appItems }] : NAV_GROUPS

  return (
    <div className="h-full flex flex-col bg-sidebar border-r border-border overflow-hidden">
      <div className="h-9 px-3 border-b border-border shrink-0 flex items-center">
        <span className="text-xs font-semibold text-fg-muted uppercase tracking-wider truncate">
          Settings
        </span>
      </div>
      <div className="flex-1 overflow-auto py-1">
        {navGroups.map((group, i) => (
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
                    useEditorStore.getState().openTab({ path: item.path, content: '', dirty: false })
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

// "i" in a circle, for Settings > About (VIDE-143). Same size/stroke as
// SettingsIcon.
function AboutIcon() {
  return (
    <svg width="1.25rem" height="1.25rem" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 11v5.5M12 7.75v.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
