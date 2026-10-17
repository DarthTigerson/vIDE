export interface ShortcutEntry {
  keys: string[]
  label: string
}

export interface ShortcutGroup {
  category: string
  items: ShortcutEntry[]
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    category: 'Navigation',
    items: [
      { keys: ['⌘', 'B'], label: 'Toggle Sidebar' },
      { keys: ['⌘', 'P'], label: 'Command Palette' },
      { keys: ['⌘', '⇧', 'P'], label: 'Action Palette' },
      { keys: ['⌘', 'F'], label: 'Find' },
      { keys: ['⌘', '⇧', 'F'], label: 'Find in Files' },
      { keys: ['⌘', 'T'], label: 'New Terminal' },
      { keys: ['⌘', 'L'], label: 'Send Selection to Chat / Show Chat' },
      { keys: ['⇧', '⇥'], label: 'Toggle Bridge Agent Mode' },
    ],
  },
  {
    category: 'Editor',
    items: [
      { keys: ['⌘', 'S'], label: 'Save' },
      { keys: ['⌘', 'K'], label: 'Inline Edit' },
      { keys: ['⌘', 'D'], label: 'Split Pane Horizontal' },
      { keys: ['⌘', '⇧', 'D'], label: 'Split Pane Vertical' },
      { keys: ['⌘', 'Click'], label: 'Go to Definition' },
      { keys: ['⌥', 'Z'], label: 'Toggle Word Wrap (Editor/Git Log)' },
    ],
  },
  {
    category: 'Project',
    items: [
      { keys: ['⌘', 'N'], label: 'New File' },
      { keys: ['⌘', 'O'], label: 'Open Project' },
      { keys: ['⌘', '⇧', 'R'], label: 'Switch Project' },
      { keys: ['⌘', '⇧', 'N'], label: 'New Window' },
      { keys: ['⌘', 'W'], label: 'Close Tab' },
      { keys: ['⌘', '⇧', 'W'], label: 'Close Window' },
      { keys: ['⌘', '⇧', 'T'], label: 'Reopen Closed Tab' },
    ],
  },
  {
    category: 'App',
    items: [
      { keys: ['⌘', ','], label: 'Preferences' },
      { keys: ['⌘', 'R'], label: 'Reload Focused Tab / Browser Page' },
      { keys: ['⌘', '⌥', 'R'], label: 'Restart vIDE' },
    ],
  },
  {
    category: 'Display',
    items: [
      { keys: ['⌘', '+'], label: 'Zoom In (Focused Editor/Terminal/Browser)' },
      { keys: ['⌘', '-'], label: 'Zoom Out (Focused Editor/Terminal/Browser)' },
      { keys: ['⌘', '0'], label: 'Reset Zoom (Focused Editor/Terminal/Browser)' },
      { keys: ['⌘', '⇧', '+'], label: 'Zoom In (Global)' },
      { keys: ['⌘', '⇧', '-'], label: 'Zoom Out (Global)' },
      { keys: ['⌘', '⇧', '0'], label: 'Reset Zoom (Global)' },
    ],
  },
]
