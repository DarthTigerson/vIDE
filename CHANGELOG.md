# vIDE

## v0.2.5 (2026-08-26)
- **Claude Code MCP for To Do**: a new toggle in Settings > To Do lets Claude Code list, search, create, and update todos by ticket ID — no more pasting ticket details into the chat. Registers a user-scoped MCP server so it's available in every Claude session regardless of which project is open
- **Claude Code MCP for Notes**: a matching toggle in Settings > Notes gives Claude Code access to your notes library — it can list all notes, read any note by path, search content across all notes, and create or overwrite notes. Same user-scoped MCP approach as To Do
- Notes panel and To Do data now auto-refresh when files are changed externally (e.g. by Claude writing via MCP), so the UI stays in sync without a manual reload


## v0.2.4 (2026-08-24)
- **Renamed Huginn to vIDE** (Vibecoding IDE) — app name, window title, menus, install script, and update checker all updated; existing settings, usage history, and language-server binaries carry over automatically on first launch
- **Background Image picker**: Settings > Display and the setup wizard now offer a choice of None, the vIDE badge, or Clawd, in place of the old on/off toggle
- **Internal To Do**: a built-in Kanban board (projects, drag-and-drop columns, attachments, single label + free-form tags) replaces the old external Jira-style To Do link, with a tab-based detail page and inline "+ Add issue" composers on each column
- **Notes**: a new Notes panel with a single fixed root of notes and folders, Book/Chapter icons with depth-aware labels, and drag-and-drop moving (with an undo toast) shared with the file Sidebar
- To Do and Notes can each be toggled on/off from Settings


## v0.2.3 (2026-08-22)
- **First-launch setup wizard**: new installs now walk through theme (including panel style and background image), assistants (Claude/Codex/Bridge, with the CLI check built into this step), git identity, and macOS permissions before landing in the app
- Renamed the "Cosmos" assistant to "Bridge" throughout the app, matching its existing name in docs
- **Per-project URL overrides**: Jira and Git remote links can now be set per-project instead of only globally
- Claude's animated "working" indicator (activity bar icon and the commit-message generate button) now draws from a shared pool of gifs instead of a single one
- Widened the Git settings page layout


## v0.2.2 (2026-08-20)
- **Search and filter in Git Graph & Branch Diff**: a search bar plus filter dropdowns for branch, tag, and author — search reaches your full commit history, not just what's scrolled into view
- **Infinite scroll in Git Graph & Branch Diff**: both views now load more commits as you scroll instead of stopping at a fixed page
- A draggable divider in Git Graph and Branch Diff resizes how much space the ref badges get against the graph/commit list
- Refresh in Git Graph and Branch Diff is now a spinning icon button instead of a text link
- **Claude busy indicator**: the Claude icon in the sidebar toggle animates while Claude is actively generating a response, detected automatically from its terminal output
- The commit-message generate button now plays a fun animation while Claude writes your commit message

**Bug fixes**
- Fixed Docker showing "not installed" when it's actually installed but just not visible on the restricted PATH Electron apps get when launched from Dock/Finder rather than a terminal — Docker's CLI is now resolved via a login shell, the same way `claude`/`graphify`/language servers already were


## v0.2.1 (2026-08-18)
- **Favorite repos**: star repos in the Git panel to pin them to the top of the repo list, the footer's quick-switch menu, and the project list's ordering; a repo-scan-depth setting in Settings > Git controls how deep multi-repo discovery looks for nested repos
- **Publish Branch**: pushes a new branch and sets its upstream (`git push -u origin <branch>`) so a plain Push works afterwards — available from the Git panel and the footer menu
- **Commit without hooks**: an inline `--no-verify` option skips pre-commit hooks for a single commit
- **Layout Mirror**: flip which side the sidebar and chat panel render on, from Settings > Display
- **Solid Colours panel style**: a new option alongside Matt/Glossy/Glass, with bolder dividing lines
- Git Log terminal visibility is now configurable in Settings > Git — always jump to it on a command, or only when one fails
- Git panel's Fetch/Pull/Push buttons redesigned as split pills with a chevron for extra actions (Publish Branch, Force Push, etc.); the footer Git menu gained a matching "Switch Branch…" shortcut and favorite-repos quick-switch section
- A "reveal in file tree" button next to the repo dropdown jumps straight to the selected repo's folder in the sidebar
- Native dropdowns across Settings (Display, Git, Models) and Mobile Display replaced with a themed dropdown matching the rest of the UI
- Commit-message generate button now uses the Claude icon

**Bug fixes**
- Fixed Claude usage stats, the Usage Graph, and AI commit-message generation silently showing no data on some machines — the usage poller now resolves the `claude` CLI the same way (via an interactive login shell) as every other feature that shells out to it, instead of a plain non-interactive shell that can miss PATH entries set up by nvm and similar tools


## v0.2.0 (2026-08-16)
- **Docker controls**: a new Docker panel (toggle it from the activity bar, enable it first in Settings > Docker) lists your local containers with live status, and lets you start/stop/restart/remove them without leaving Huginn or switching to Docker Desktop; click a container to stream its logs in its own tab
- **Multi-repo Git support**: opening a folder with several sibling git repos now discovers all of them — a repo dropdown in the Git panel picks which repo the panel, Git Graph, and List Diff are scoped to, and a "Show all repos" overview lists every discovered repo at a glance. The footer and branch palette automatically follow whichever repo the focused editor tab belongs to

**Bug fixes**
- Fixed diff tabs and the editor gutter's change indicators colliding when the same relative file path exists in two different repos
- Clicking a file path in the Claude/Codex terminal now opens the diff in the file's own repo instead of assuming the project root


## v0.1.7 (2026-08-16)
- **Glass panel style**: a new Panel Style option makes the editor and terminal panels see-through, with an optional decorative background image you can enable in Settings > Display
- **AI-generated commit messages**: configurable model and prompt in Settings
- **Claude usage tracking**: full Usage Graph tab with interactive session/weekly charts, plus an estimated cutoff time
- **Editor breadcrumb**: shows the current file's path with folder/file icons above the editor
- **Editor right-click menu**: cut/copy/paste and other editor commands, also available from the Command Palette with shortcut hints shown
- **Word wrap**: toggle from Settings > Editor
- **In-file search**: ⌘F now searches the current file using Monaco's native find widget; ⌘⇧F still searches the whole project
- **Mobile Display**: pick which network interface gets shown/QR'd for pairing, disconnect individual or all paired devices, copy pairing info, and clearer disconnection status
- Editor gutter now colors line numbers for uncommitted changes (added/modified/deleted), matching the Git panel's file list colors
- ⌘+/⌘− now zooms just the focused Claude/Codex panel's font size, separate from the app-wide shortcut

**Bug fixes**
- Fixed the discard-changes confirmation modal
- Fixed a rare drag-state bug when dropping files onto editor split panes
- Fixed a rare case where stale compiled build output could get served instead of the real source


## v0.1.6 (2026-08-15)
- **Tab context menu**: right-click a tab to pin it, close all tabs, or split the view (with a directional submenu); tabs can also be dragged and dropped between panes
- **Jira**: pin a Jira page as a browser tab, mirroring the existing To Do integration
- **Git remote shortcut**: a sidebar icon jumps straight to your repo's GitHub/GitLab/Bitbucket page, configured from Git settings
- **Recent projects**: the sidebar now shows a scrollable inline list of recent projects when no folder is open, instead of a separate button
- Claude/Codex terminal output: click a file path to open it in the diff viewer or editor, or click a URL to open it in a browser tab
- RAM usage now shown in the title bar
- Browser tabs gained a mobile viewport toggle and a clear-cache option
- Display settings: choose what the footer shows — rotating tips or a live clock
- The chat panel now stays closed until a project is opened, then opens automatically
- Settings sidebar icons are now visually separated from the top group
- Footer items show a hover label, and the autocomplete icon hides when autocomplete is disabled
- Git Graph pipes now render smoother curves through crossing commits

**Bug fixes**
- Fixed ⌘B (toggle sidebar) not responding reliably while the editor had focus
- Fixed the AI panel opening unexpectedly when collapsing the sidebar
- Fixed browser tabs rendering behind other panels
- Fixed Git Graph pipe colors bleeding into crossing pipes
- Fixed Graphify's PreToolUse hook pointing at a stale, machine-specific path


## v0.1.5 (2026-08-12)
- **Discard all changes**: clear every uncommitted change from the Git panel in one action
- **Reveal in site tree**: jump to a file in the sidebar from the Git commit details panel, and diff editors now auto-reveal their file in the tree
- Added a user preference for which branch the Git list view defaults to
- Git log terminal now respects your configured font size
- Improved reliability of the Git panel's periodic fetches
- The install script now requests admin rights (with a safe rollback if the update fails partway) when updating Huginn in /Applications, instead of failing silently

**Bug fixes**
- Fixed the commit details panel resetting when it lost focus
- Fixed the wrong default branch loading in the Git panel


## v0.1.4 (2026-08-12)
- **Go to Definition**: ⌘-click a symbol to jump to it, backed by real language servers for TypeScript/JavaScript, Python, Go, and Rust (opt-in per language in Settings > Editor)
- **Git Graph**: right-click a commit's file to open it or its diff, right-click a branch/tag to check it out, and List Diff now shares the same commit details panel as Git Graph
- **External To Do**: pin a task-tracking page as a browser tab, with a global on/off toggle and an option to auto-collapse the sidebar when opening it
- **Switch Project (⌃R)**: now jumps to the window a project is already open in, instead of reloading it in the current window or opening a duplicate
- Check for Updates is now available from the app menu
- Graphify's "Enable for Claude Code" now stages the generated skill files with git automatically
- Footer tips and the shortcuts overlay now cover the newer features (Go to Definition, Graphify, Mobile Display, To Do, browser tabs, Usage panel)

**Bug fixes**
- Right-click menus (file tree, Git panel, commit/branch context menus) no longer appear offset from the cursor or behind other panels under the "glossy" panel style
- The branch switcher palette no longer renders in the wrong place inside the Git panel
- Editor tabs and the diff viewer now refresh automatically when a file changes outside Huginn
- Git panel status has a polling fallback so it stays fresh even if the native file watcher misses a change
- Long branch names no longer overflow in the Git panel and status bar
- Git Graph spacing and pipeline rendering fixes


## v0.1.3 (2026-08-10)
- **Git panel**: redesigned with a branch switcher palette, quick force-push buttons, and right-click copy for commits
- **Themes**: added Luuk Dark/Light and a changelog preview shown after updates

**Bug fixes**
- Git panel no longer goes stale when files change outside the app
- Force-push safety modal now actually shows from the footer menu
- Fixed unreadable colours and white scrollbars in dark/light themes


## v0.1.2 (2026-08-10)
- Improved autocomplete logic and ui
- Implement graphiphy to reduce claude token usage aswell as speed up usage


## v0.1.1 (2026-08-09)
- Implemented quick repo change with Control + R
- Implemented notification system to show help messages and update notifications
- Added image and markdown viewers, fixed tree sync, dimmed ignored files


## v0.1.0 (2026-08-09)
- Switch distribution to curl-install script (zip/tar.gz instead of dmg/deb)