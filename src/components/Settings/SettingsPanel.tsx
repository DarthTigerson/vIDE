import { useEditorStore } from '@/stores/editorStore'
import { GENERAL_SETTINGS_TAB_PATH, DISPLAY_TAB_PATH, EDITOR_SETTINGS_TAB_PATH, GIT_SETTINGS_TAB_PATH, BROWSER_SETTINGS_TAB_PATH, MODELS_SETTINGS_TAB_PATH, GRAPHIFY_SETTINGS_TAB_PATH, JIRA_SETTINGS_TAB_PATH, DOCKER_SETTINGS_TAB_PATH } from './paths'

const NAV_ITEMS = [
  { path: GENERAL_SETTINGS_TAB_PATH, label: 'General' },
  { path: BROWSER_SETTINGS_TAB_PATH, label: 'Browser' },
  { path: DISPLAY_TAB_PATH, label: 'Display' },
  { path: DOCKER_SETTINGS_TAB_PATH, label: 'Docker' },
  { path: EDITOR_SETTINGS_TAB_PATH, label: 'Editor' },
  { path: GIT_SETTINGS_TAB_PATH, label: 'Git' },
  { path: GRAPHIFY_SETTINGS_TAB_PATH, label: 'Graphify' },
  { path: JIRA_SETTINGS_TAB_PATH, label: 'Jira' },
  { path: MODELS_SETTINGS_TAB_PATH, label: 'Models' },
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
        {NAV_ITEMS.map((item) => (
          <button
            key={item.path}
            type="button"
            onClick={() =>
              useEditorStore.getState().openTab({
                path: item.path,
                content: '',
                dirty: false,
              })
            }
            className={[
              'w-full text-left px-3 py-1.5 text-sm transition-colors',
              activeTabPath === item.path ? 'bg-accent/10 text-fg' : 'text-fg hover:bg-white/5',
            ].join(' ')}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  )
}
