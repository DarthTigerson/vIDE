# vIDE
## v0.2.30 (2026-10-23)
- **Rocky mode for every agent**: the "+" menu now has Normal and Rocky tabs at the top. On the Rocky tab every agent shows Rocky's icon and starts in Rocky mode: Claude Code becomes Rocky Code, and Bridge and Llama sessions answer in Rocky's voice. The menu remembers the tab you last picked, so whichever mode you use most is one click. Rocky Bridge and Llama sessions keep Rocky's icon in the session bar and stay in Rocky mode after a relaunch. New Agent Session in the Action Palette lists a "(Rocky mode)" entry for each agent. The separate Rocky Code row is gone, since the Rocky tab replaces it
- **Hide items in the Site Tree**: right-click a file or folder for a new Hide submenu. Hide that one item, everything with the same name, or every file with the same extension, and switch hidden items, gitignored items, dotfiles and graphify output on or off for the repo. Hidden items can be shown faded and tagged "hidden" from an eye button in the Site Tree header, and unhidden from the same submenu. Search keeps their matches in a collapsible Hidden results section instead of mixing them in
- **Hidden items settings**: a new section in Settings > Site Tree lists every repo's hide rules, plus rules for All repos that apply everywhere. Make a repo's rule global, remove rules one by one, reset one repo, or clear everything with Master Reset. "Hidden items settings…" at the bottom of the Hide submenu jumps straight there. Hide rules sync through vIDE Sync
- **All Apps right-click menu**: right-click an app to favourite or unfavourite it, open its settings, or enable or disable it. The row you right-clicked stays highlighted while the menu is open
- **Disabled apps in All Apps**: a collapsible Disabled section under More Apps lists the apps you've turned off. Click one to enable it again, or drag an app onto the section to disable it
- **New file button in the tab bar**: a + at the end of each pane's tabs opens a new scratch file in that pane
- **Full file paths in multi-repo projects**: when the project folder holds several git repos, Claude, Rocky, Bridge and Llama are told to always write full absolute file paths, so file links in chat open the right file instead of guessing which repo a path belongs to



## v0.2.29 (2026-10-23)
- **Graphify reminders in notifications**: once a repo has a graph, the notification bell offers to add `graphify-out/` to its `.gitignore` if it isn't ignored yet, and to set graphify up for Claude Code if the project doesn't have its skill. Click a notification to apply it, or close it with ×. Both checks run when a repo opens and after each graph build, and each has a "Remind to…" switch in Settings > Graphify (on by default)
- **Graphify hooks repair themselves**: when a project's Claude Code hooks point at a graphify binary from someone else's machine, vIDE reinstalls them on open so they point at yours
- **Llama server output in every window**: a llama-server started in one window, or before a reload, now shows its output on the model's page in any window. A server started outside vIDE says so instead of showing an empty box
- **Prompt progress in Bridge chat**: a light in the composer shows while llama.cpp is reading your prompt and how far along it is, before the reply starts
- Settings > Graphify's Claude Code section is gone; setting it up now happens from the notification

**Bug fixes**
- Fixed a long-running llama-server's output growing without limit; vIDE now keeps only the most recent part


## v0.2.28 (2026-10-22)
- **Redesigned Bridge and Llama chat**: each turn now plays out as an activity rail, with a step for the model's reasoning, each tool call and each file edit. Reasoning streams in live and folds into "Reasoned for Ns" when it's done (click to read it again), tool steps show what they read, searched or ran and how long it took, and edits show their diff inline. Models that put their thinking in `<think>` tags get the same reasoning step
- **Reasoning effort for Llama sessions**: a chip in the composer sets how hard the model thinks — Off, Low, Medium, High or Max — per session, and you can change it in the middle of a turn. The change is marked on the rail
- **New chat header**: shows the model, whether its llama.cpp server is running, and live tokens per second. The context meter moved up here from the composer
- **Faster long Llama sessions**: llama.cpp no longer has to re-read the whole conversation partway through a turn. Llama sessions stop trimming old tool results, and the system prompt stays the same for the whole conversation instead of changing with every message
- Auto-optimize Llama models now compact at 64k tokens, or 80% of the context if that comes first, so a huge context no longer means huge re-reads
- New Llama models default to a batch size of 2048, matching llama.cpp. Models you already have keep their setting


## v0.2.27 (2026-10-21)
- **vIDE Compacting for Bridge and Llama**: long chats now compact themselves at 80% of the model's context, or when the server rejects the prompt as too long. Compact by hand from the activity bar or a session's right-click menu. A divider in the chat marks where the summary starts, and a meter shows how much of the context is in use
- **vIDE tools for Bridge and Llama**: Bridge and Llama sessions now get the same vIDE tools Claude has, including To Do, Notes, Scripts, the browser and web search. The To Do progress-comment rule applies to them too, and their comments and tickets show Bridge or Llama badges on the board
- **Plan big tasks on the To Do board**: new To Do tools let any agent break a large task into a project of small tickets, then work through them one at a time
- **Read big documents in sections**: every agent can now list a Markdown document's headings and read just the section it needs, instead of the whole file
- **Auto-optimize for Llama models**: a new per-model switch lets llama.cpp fit the context size and GPU layers to the memory you have free, with a smaller KV cache and a 2 GB cap on the prompt cache
- **Usage, Cost and Usage Graph from any session**: open them from Bridge and Llama sessions too, not just Claude. Usage and Cost only close when you switch to a terminal, and the "(Claude only)" button labels are gone
- The tool-call round limit is now set per Llama model instead of being fixed at 40
- Bridge now reads at most 500 lines of a file at once, and ranged reads say which lines they show
- Long Bridge turns now trim old tool results and file contents in batches, keeping the last 4 rounds whole, so llama.cpp can reuse its prompt cache instead of starting over each round


## v0.2.26 (2026-10-20)
- **Bottom terminal**: a new per-project switch locks every terminal into a panel under the editor. Terminals you already have open move down there, and new ones (⌘T, the Action Palette, running a script) open there too. The panel has one or two sides, left and right, each with its own tabs. Drag tabs to reorder them, drop one on the other side to move it there, or drop it on a side's left or right edge to split. Right-click a tab to close it, close the others, split, move it to the other side, clear it or run a script in it. Turn it off and each terminal goes back to the pane it came from, or to wherever new tabs open if that pane is gone. Shells keep running through the move, and each project remembers the switch, its tabs and the panel height. Switch it from the footer's display chip, Settings > Display, or "Show/Hide Bottom Terminal" in the Action Palette. Agent sessions in the session bar stay where they are
- **Display popover**: the footer's display chip now opens a small panel with a font size stepper, the Bottom terminal switch and a link to Settings > Display, instead of opening the settings tab straight away
- **Local autocomplete**: inline suggestions are back, now run by a local model through llama.cpp instead of the Claude CLI. vIDE downloads and manages the model for you, and suggestions use your open tabs and the project graph for context. An experimental project context switch is in Settings. The footer's autocomplete pill can snooze suggestions, stop or start the model, and always shows, even when autocomplete is off
- **Language server autocomplete and hover docs**: completions and hover documentation from the same language servers as Go to Definition, with switches in the footer panel. YAML and JSON language servers are new, and the Go to Definition languages in Settings are now a table
- **Web search**: Bridge can search the web through DuckDuckGo, and a new MCP server gives Claude the same tool, both behind a setting
- **One-click graphify install**: Settings > Graphify can install graphify for you, the same way llama.cpp installs
- Footer popovers now close each other, so only one is open at a time


## v0.2.25 (2026-10-18)
- **Pick up where you left off**: quit vIDE and open it again, and every window comes back with its project, at the same size and spot on screen (or maximized, if it was). Each window reopens the files you had open, in the same order, with your split panes, each pane's active tab and the pane you were working in. Terminal tabs and Terminal sessions in the session bar come back too, as fresh shells in the project folder. Opening a project later from Switch Project or Recent Projects brings back its tabs and window size the same way. Deleted files are skipped, and a window saved on a monitor that's no longer connected opens centred on your main screen
- **⌘Q closes just this window**: ⌘Q now closes the window you're in instead of quitting every vIDE window, and quits only when it's the last one. **⌘⇧Q** quits vIDE and closes all windows. Both still warn about unsaved work first
- **Scripts**: a new app for the shell routines you run over and over. Each script has a name, a description of what it's for, and its commands. Run one from the Scripts panel or the Action Palette ("Run Script: …") to open a new terminal and run it there, or pick it from the Scripts submenu on a terminal tab, inside a terminal, or in the "+" new-session menu to run it in that terminal. It runs as if you'd typed it, so a `cd` or an activated environment sticks. Scripts you've run in the current project sort first, and the script's page shows which projects it's been used in. Scripts sync through vIDE Sync, and a new vide-scripts MCP server lets Claude list, read, write and run them
- **Rocky Code**: a new option in the "+" menu, under Claude Code. It's Claude Code on Opus that talks like Rocky from *Project Hail Mary* in chat, while code, commits and files stay in plain English. To save usage, it hands heavy file reading to a Haiku helper and large, clear-cut edits to a Sonnet helper, then reviews what comes back itself before calling the work done. Rocky sessions work like Claude sessions everywhere, come back after a relaunch, and have their own working animations in the session bar
- **Memory breakdown**: hovering the memory pill now shows everything vIDE runs, not just the app itself. Under a new **vIDE total** you get vIDE, a row for each Claude session (in its session colour), and terminals and language servers while any are running. Claude sessions, with their MCP servers, often use as much memory as vIDE does, and weren't counted before
- **All Apps redesign**: the list is now split into the apps on the bar and the rest, with a list or icon view. Drag an app to exactly where you want it on the bar, and your starred apps sort to the top. An unpinned app you open now keeps its slot on the bar until you open another one


## v0.2.24 (2026-10-17)
- **One session bar for every agent**: Bridge and local Llama models now run several sessions side by side, just like Claude, all in the same bar. The "+" button opens a menu of every agent that's available, plus a plain **Terminal** session that's always offered and needs no agent enabled. "New Session" in the Action Palette lists them all too
- **Close Other Sessions**: a session's right-click menu can now close every other session at once (hidden when it's the only one)
- **All Apps**: a new four-squares icon in the activity bar opens a list of every enabled app with a search box. Site Tree, Search and Git stay locked at the top; star an app in the list to pin it to the bar (Docker and Llama are pinned by default), or unstar it to take it off. Drag pinned apps to reorder them, drag a row from the list onto the bar to pin it, or drag a pinned app onto the list to unpin it. An unpinned app you open shows under the divider while it's active, and its badge count shows in the list, with a dot on the All Apps icon when one has something new. Your pinned apps sync through vIDE Sync and update live in every open window
- **Battery in the title bar**: on a laptop, a battery icon with its percentage sits beside the memory pill. Hover it for whether it's on battery, charging or plugged in, and the time left. It turns red at 20% or below, fills gold while charging, and doesn't show at all on a machine without a battery
- **Notes sorting**: right-click in the Notes panel for Sort by Alphabetical, Created, Updated or Manual. In Manual, drag notes and folders up and down to put them in your own order — a line shows where each will land, and dropping on the middle of a folder still moves it inside. Folders stay above notes in every mode, and the sort and your manual order sync through vIDE Sync
- **Drag files into the editor**: drag a file from the Site Tree onto an editor pane to open it, or onto the pane's edge to split the pane and open it there. It works on an empty editor, on browser tabs and over other files; a file that's already open moves over like a dragged tab
- **Switch Project never replaces your project**: picking a project in Switch Project (now ⌘⇧R) always opens it in a new window, or jumps to the window it's already open in. Only an empty window loads it in place. The ⌘↵ option is gone, since Enter does this now
- **Reload a tab (⌘R)**: reloads the focused browser page, or re-reads the focused file from disk (unsaved changes are kept). Terminals and agent panels ignore it, so ⌘R in a shell still reaches the shell
- **Restart vIDE (⌘⌥R, Ctrl+Alt+R on Linux)**: a last-resort recovery that reloads every window, even one that's frozen, without quitting the app or ending your sessions. Also in the app menu and the Action Palette ("App: Restart vIDE"), with "App: Reload Window" beside it
- Switch Project moved from ⌃R to ⌘⇧R, so Ctrl+R reverse-search works in terminals again
- The file tree is now called the **Site Tree** everywhere — its icon, its panel header (which used to show the project name), Settings, the Action Palette and every "Reveal in Site Tree" menu item
- The session bar's three-dot grip is now a half-moon tab with an arrow pointing the way it will open or close
- Files and folders now sort numbers by value in the Site Tree, Notes and the mobile view, so 0.1.3 comes before 0.1.21
- Dragging over the All Apps list now tints it the same way as the Site Tree and Notes, instead of outlining the panel
- Popups that rise from the footer (notifications, alarms, the clock and hover labels) no longer cast a shadow onto the footer, so they look like they slide out from behind it
- Added a new animation to Claude's "working" gifs

**Bug fixes**
- Fixed vIDE Sync reopening closed To Do tickets: a machine holding an older copy of a ticket overwrote newer changes from your other machine on every sync. Each ticket and board now keeps whichever copy was changed most recently, and new ticket numbers can no longer repeat. Update vIDE on every synced machine to stop it for good
- Fixed Custom editor colours picked on a dark theme disappearing on a light one (and the other way round) — light and dark themes now each keep their own set


## v0.2.23 (2026-10-14)
- **Claude session names**: the Claude session bar now widens to show each session's name beside its icon, so stacked sessions are no longer told apart by colour alone. The name follows the title Claude Code gives the conversation (or "Session N" until it sets one), and Rename… in a session's right-click menu sets your own — leave it blank to go back to the automatic title. Bridge and Llama keep the narrow icon bar
- **Collapsible session bar**: a grip on the bar's inner edge, near the bottom, collapses it back to icons only or expands it to show names; collapsed, hovering a session's icon shows its name. Prefer it out of the way? Pick "Expand on hover" under Settings > General > Agent panel and the bar stays as icons, widening over the panel while you hover it
- **Claude sessions come back after a relaunch**: each Claude session now resumes its own conversation when you reopen vIDE or switch back to a project, instead of starting empty. It follows the conversation through /resume, /clear and compact, and starts fresh if the old conversation is gone. This stays on the machine and doesn't go through vIDE Sync

**Bug fixes**
- Fixed Custom editor colours reverting to the default placeholders when vIDE opened on a non-editor tab (like Settings), until you changed a colour, theme or panel style


## v0.2.22 (2026-10-09)
- **Inline diff highlight**: lines you've changed since the last commit now get a faint tint in the editor — green for added, amber for modified — and the exact words that changed are highlighted on top. Switch it on or off from a new highlighter button in the footer, "Show/Hide Inline Diff Highlight" in the Action Palette, or Show/Hide Inline Diff in a tab's right-click menu. Very long lines and very large edited blocks skip the word highlight so typing stays smooth
- **Change colours and strength**: in Settings > Git, pick Default colours (green, amber and red, with darker shades on light themes) or your own for added, modified and deleted lines — the gutter line numbers use them too — and choose Subtle, Medium or Strong. The footer button can be hidden from the same place
- **Redesigned settings**: every settings page is now laid out as feature blocks — a title, a one-line description and its switch, with each control sitting right next to its label instead of out at the far edge. Git, General, Editor, Display, File Tree, Docker and Claude show a live picture of what each setting does that changes as you flip it. Options for a feature that's switched off now stay in place, greyed out, instead of disappearing, so the page doesn't jump
- **Open new tabs in**: one setting in Settings > General replaces the eight separate "Always open in biggest pane" switches — Active window or Biggest window (the default), with the choice explained under it. Every way of opening a tab follows it, from files and settings to Git, notes, todos and browser tabs, while Go to Definition always stays in the window you're working in
- **Side panel and chat sizes**: the side panel and the Claude/Bridge chat now size themselves to the text instead of taking a share of the window, so the file tree no longer opens a quarter of a big screen wide. Changing the text size grows or shrinks them with it, resizing the window leaves them alone, and widths start once from the new defaults
- **Popups over browser tabs**: modals, palettes, right-click menus (including on a browser tab itself), dropdowns and footer popups now appear above browser pages instead of hidden behind them — the page shows as a still snapshot while the popup is open
- The footer icons on the right now show the same hover label as the clock
- "Change All Occurrences" is now always in the editor's right-click menu, and the setting to hide it is gone; ⌘F2 works as before


## v0.2.21 (2026-10-09)
- **Update page**: clicking "vIDE vX is available" now opens an Update tab instead of a terminal. A track shows the update moving through Download → Install → Ready, and if macOS needs your password to replace vIDE in /Applications the page says so instead of looking stuck. When it's done, Restart now and Later are right there on the same page — Later keeps "Update installed — click to restart" in the bell. If it fails, the page explains why and offers Try again, and Show details reveals the installer's output at any point
- **What's new while you update**: the new version's highlights sit beside the progress, with the full release notes one click away
- **Settings > About**: a new page in the General group with your version in the primary colour, a Check for updates button that shows when it last checked, and Update to vX when a new version is out. Below it, the full release history: versions on the left, and each one's notes on the right, laid out as titled changes, other changes and bug fixes. It reads the changelog that ships with vIDE, so it works offline, and it's also in the Action Palette as "Settings: About"
- **After an update**: vIDE now opens Settings > About on the new version instead of the What's New popup, says which version you updated from, and marks every release that update brought in as New, so skipped versions are easy to spot

**Bug fixes**
- Fixed a failed download during an update being reported as a successful update


## v0.2.20 (2026-10-08)
- **Silent alarms**: click the clock in the footer to open a new Alarms tab and set named alarms (Stand-up, Lunch…) that ring once at the next occurrence of that time or repeat on the days you pick (Monday first). Nothing plays a sound — when one goes off, lines drip from the centre of the footer out to its edges, the corners flare as each one arrives, and a popup above the clock lets you Snooze (9 minutes) or Stop it. Rename an alarm by clicking its name, and switch it on or off or delete it from its row
- The alarm time picker is a single field with Hour, Minute and AM/PM columns that follows your system's 12- or 24-hour clock. While an alarm is set, a small alarm icon sits before the time and hovering the clock shows the next one ("Break at 10:06 PM · in 8 min"). Alarms are also in the Action Palette (View: Alarms, Alarm: Snooze, Alarm: Stop), stay on this machine rather than going through vIDE Sync, and stopping one in any window stops it everywhere
- **Redesigned footer**: the clock now lives in the far-right corner at every window width, in full text colour and a size larger, and hovering it shows the date ("Thursday the 8th of October"). It used to be dim, and was hidden whenever a notification was showing or the window was narrow
- **Notification bell with a count**: a bell next to the clock shows how many notifications are active — filled while any are unread, outlined once you've opened the panel. The panel now opens above the bell with a "Notifications · N" header, a Dismiss all button and an unread dot on each row
- **Notification peek**: a new notification now briefly pops up above the bell instead of replacing the clock. Several arriving close together stack, each with its own 5-second countdown line; hovering holds them, clicking one runs its action, and "+N more" opens the full panel. The bell rings once as they arrive
- **Cursor position in the footer**: Ln and Col for the file you're editing, hidden on non-editor tabs like Settings
- The footer's font-size control is now a compact chip (screen icon + size) that opens Settings > Display; ⌘+ / ⌘− / ⌘0 still change the size and briefly highlight it
- The branch in the footer now opens the git quick-actions menu on a left click as well as a right click, and the menu opens above the branch name. The ahead/behind arrows are proper icons, and the sync icon matches the other footer pills
- The git activity bar now runs just above the footer instead of over its top border
- Removed the rotating footer hints and the Settings > Display "Footer Content" option — the centre of the footer is kept clear for git blame and status messages


## v0.2.19 (2026-09-29)
- **Git blame**: see who last changed the line your cursor is on — the author and commit message show in the footer next to the branch (the default), or at the end of the line in the editor. Hover it for a panel with the author, exact date and time, and the full commit message. Turn it off or pick where it shows in Settings > Git > Blame, and it syncs through vIDE Sync
- **Git status in the file tree**: changed files show their status letter (M, A, D, R, U) in the Git panel's colours, their names take the same colour, and folders get a coloured name and dot when something inside them has changed. A new Settings > File Tree page switches between Off, Letter, and Letter + Colour
- **Reveal in Finder**: from the file tree, the Git panel (changed files and the repo header), the Search panel, and editor tabs (macOS only on tabs). Changed files in the Git panel, Search results and editor tabs also gain Reveal in File Tree
- **Search panel right-click menu**: right-click a result's file or any matching line for Open / Edit, Reveal in File Tree, Copy, Copy Path, Reveal in Finder and Move to Trash — a trashed file drops out of the results straight away
- **Scratch tabs**: double-click the tab bar or press ⌘N for an Untitled tab that lives only in memory, and ⌘S opens a Save dialog that keeps the tab where it is. ⌘N used to create a file in the file tree; Create File in the tree's right-click menu still does that, in the folder you clicked
- **Unsaved work guards**: closing a scratch tab with content now asks first — from its ×, the tab menu, ⌘W, Close All and Close Others — and closing a window with unsaved work warns you, listing never-saved tabs and unsaved files separately
- **Close Others** in the tab right-click menu closes every other tab in that pane, leaving pinned tabs and other split panes alone
- **To Do Trash**: deleting a project now moves it to a Trash page where you can restore it from the right-click menu. Trashed projects are hidden from Claude's To Do tools, and the Trash shows each project's todo counts by status
- **To Do project list**: sort projects alphabetically, by created date, by open todo count or by Backlog size from the list's right-click menu, and choose which status counts show next to each project from its Display submenu
- Move to Trash on an untracked file in the Git panel now asks for confirmation, the same as the file tree
- The file tree's activity bar icon is now labelled "File Tree" instead of "Explorer"

**Bug fixes**
- Fixed a deleted To Do project coming back after vIDE Sync merged it in from another machine — projects now go to the Trash instead, which syncs


## v0.2.18 (2026-09-22)
- **Custom editor colours**: a new "Custom" option in Settings > Display > Editor Colors lets you pick your own syntax colours for keywords, strings, numbers, types/keys and comments with the same colour picker as Custom Themes, plus a Reset to defaults button. Your colours sync through vIDE Sync, and they start from the current theme's palette until you change one
- **Unpushed commits on the Push button**: the Push pill now turns amber and shows a count whenever your branch has commits that haven't been pushed yet, then goes back to normal once the push lands, so it's harder to commit and forget to push
- **Tidier Git panel buttons**: Fetch now lives in Pull's dropdown, the unpushed-commit count sits inside the Push button, and Reset, Hard Reset and Undo Last Commit are grouped under one Git Functions dropdown. The Pull/Push dropdown now spans the full button row, and the branch checkout button shows the branch name with a "Checkout" caption underneath
- "Undo Last Push" is renamed to "Undo Last Commit" everywhere, since it only undoes your last local commit (keeping its changes staged) and never touches the remote
- Added a contributors section to the README with Special thanks to Gabriele Grech and Keith Fenech

**Bug fixes**
- Fixed vIDE Sync failing to authenticate on GitLab (and on GitHub unless the macOS Keychain already had a github.com login): the access token is now actually sent, sync never falls back to a credential helper or password prompt, and existing sync setups are fixed automatically on launch
- Fixed the Custom editor colour scheme picking the wrong light/dark base when a custom theme's background brightness didn't match its theme family


## v0.2.17 (2026-09-21)
- **Animated sync screen**: while vIDE pulls your synced settings on launch, the startup screen now shows light pulses running along circuit traces into a spinning refresh icon. It starts in neutral grey, and once the pull lands your theme's colour flows in along the traces — pulses first, then traces, icon, and background — before the app appears. It follows built-in themes, custom themes and "match system", and adapts its label to light themes. If sync is off or you're offline the app opens straight away with no swap, and with reduced motion enabled the colour change is instant

**Bug fixes**
- Fixed vIDE Sync flooding your config repo with commits — around 700 a day per running machine, because the Claude usage history changes every minute and every 2-minute sync committed it. A sync whose only change is usage history is now committed at most once every 10 minutes per machine, and it rides along with the next real change; settings, To Do and note changes still sync as fast as before


## v0.2.16 (2026-09-20)
- **Search is now a sidebar panel**: the old search modal is replaced by a persistent Search panel in the activity bar (⌘⇧F focuses it), so your results stay put while you open files and work through them. It runs on a bundled ripgrep engine that honours `.gitignore` and adds case, whole-word and regex toggles plus include/exclude glob filters; unsaved tabs are still searched from memory, and a file edited after the search gets a "changed" badge with a refresh button to re-run it
- **Replace across files**: a replace field with Replace all (confirming the match and file counts) plus per-file and per-match replace buttons. Open tabs are edited in place and left unsaved, other files are written to disk, any file that changed since the search is skipped instead of overwritten, and a 10-second Undo toast restores the previous content; regex replacements expand `$1` groups
- Search stays responsive on big result sets: typing cancels the running search immediately, the first 300 hits are drawn with a "Show more" button, and one- or two-character queries wait a little longer before searching (Enter still searches at once)
- **Find and replace in the editor**: ⌘F now opens vIDE's own floating find box in the top-right of each editor pane instead of Monaco's built-in widget — themed with the app, sized with the global font size, with case/whole-word/regex toggles, a match count with next/previous arrows, and Replace / Replace all (one undo step). ⌘⌥F opens it with replace showing; F3 / ⌘G step through matches
- **Action Palette overhaul (⌘⇧P)**: search is now ranked and fuzzy — type `git pu` or `set disp` — and an empty query shows your recently used commands first. Commands that can't run right now are greyed out with the reason instead of vanishing, and destructive ones are shown in red
- The palette now reaches every settings page (it covered 3 of 14 before), the Usage Graph, Graphify Graph, Todo Board and Notes views, plus `Claude: New Session`, `Bridge: New Session`, `Browser: New Tab` and `Graphify: Rebuild`
- **Git from the palette**: Fetch, Pull, Push, Publish Branch, Force Push (still honouring your force-push safety setting), Commit, Commit (no verify), Undo Last Commit, Stage All, Unstage All, Discard All Changes, Hard Reset…, Checkout… and Switch Repo…, plus new Stash, Stash (include untracked), Stash Pop, Amend Last Commit, Merge…, Rebase Onto…, Delete Branch…, and Merge Abort / Rebase Abort / Rebase Continue to get out of a conflict. Merge, rebase and delete pick from a branch list inside the same palette; rebase and delete confirm first, and delete only removes fully merged branches
- **File tree copy, cut and paste**: from the right-click menu or ⌘C / ⌘X / ⌘V on the selected item, plus dragging files and folders in from Finder and pasting files copied elsewhere. Copies made in vIDE can be pasted into other apps, and name clashes resolve Finder-style (`foo copy.ts`). Collapsing a folder now also collapses the folders expanded inside it
- **Diff tabs**: working-tree and commit diff tabs now show a file path breadcrumb, and an "Open File" button (also in the tab's right-click menu) opens the real file and reveals it in the file tree
- **Terminal selections**: a new right-click menu with Copy and Send to Claude, and ⌘L sends the selected text to Claude, the same as in the editor. Docker container logs now render in a read-only terminal, so the text stays selectable and can be sent to Claude too
- **Llama**: the activity bar badge now counts running Llama servers (models are probed on startup), and a footer notification tells you when llama.cpp isn't installed and opens the Llama panel to show how to install it
- **To Do**: cards get a Label submenu in their right-click menu, and the detail page's dropdowns now use the themed dropdown
- A failed AI commit-message generation now raises a notification instead of only showing in the Git panel, so you still see it if the panel is closed

**Bug fixes**
- Fixed "Copy File Path" on a diff tab not giving the file's real path
- llama.cpp being missing is no longer logged as an error


## v0.2.15 (2026-09-19)
- **vIDE Sync**: back up and sync your settings across machines through a private git repo of your own — set it up in Settings (with instructions for creating a private repo and a scoped access token) or as a new step in the first-launch setup wizard
- Settings, To Do boards, Notes (including nested folders), and Claude usage history all sync; the remote wins on conflict, and remote changes are pulled before the UI loads on launch, then applied live to the renderer instead of being overwritten
- Changes push automatically: setting changes, To Do and note edits are debounced into a push, notes sync after 20 seconds idle while you type, both machines push on launch so their data merges immediately, and a 5-minute periodic sync keeps every running machine current
- A sync status icon in the footer (left of the zoom pill) shows connecting/connected/error state and a manual sync button whenever a repo URL is set; bad credentials surface as an error instead of failing silently
- Concurrent pushes from multiple machines are serialized, and a rejected non-fast-forward push is retried so simultaneous syncs converge
- Added a fast pull-only remote check, so detecting remote changes doesn't need a full push cycle

**Bug fixes**
- Fixed notes not reaching a second machine: remote notes are now copied to the local library and the Notes UI refreshes afterwards
- Config repo sync now runs git through `execFile` instead of a shell command string


## v0.2.14 (2026-09-13)
- **Llama panel**: manage and chat with local LLMs via llama.cpp — a new activity bar icon/panel detects `llama-server`/`llama.cpp` on your PATH (resolved via a login shell, same as the Claude/Docker/Graphify checks), lists your configured models with context-menu actions, and a create/edit page lets you pick a `.gguf` file (with a native file-browse button and auto-filled name/alias), launch/stop the server, and watch its output in an always-visible, resizable panel
- Local Llama models can now be selected as a chat assistant from the same dropdown as Claude and Bridge, and the server auto-starts on first message if it isn't already running; health probing keeps the running/stopped state in sync on mount and reload
- Added a per-model and per-assistant "agent mode on launch" setting for both Bridge and Llama, plus a global default for new Llama models
- The memory usage pill now includes `llama-server`'s own memory alongside vIDE and Docker
- Added an animated "thinking" indicator, shown while Claude/Bridge is streaming a response before its first token or tool call arrives
- Moved the tool call limit setting from the Llama model page into Bridge settings; moved model action buttons into a footer bar and restyled the select dropdown and toggle switch
- Reordered the sidebar so the Llama icon sits before Mobile Display and Notes
- Documented the new Llama panel in the README

**Bug fixes**
- Fixed a new Llama model's tab path not updating to match its saved model after the initial save


## v0.2.13 (2026-09-13)
- **Mobile Display: full vIDE client**: pairing now offers a choice between the existing usage-stats view and loading the real editor, terminal, and Claude/Bridge sessions as a fully interactive second client of the same backend, over a new authenticated WebSocket relay — a "Default mode after pairing" setting skips the chooser next time, with a "Switch mode" link to change it later
- **Git Reset**: a new split button in the Git panel and footer menu — resets to the last commit, hard-resets to any picked branch/tag/commit, or undoes the last commit while keeping its changes staged so you can pull and re-commit
- Added a footer git-activity indicator: a brief running animation while a git command is in flight, and a red flash on failure

**Bug fixes**
- Fixed "Discard All Changes" wiping staged changes along with unstaged ones — staged changes are now left alone
- Fixed the Mobile Display home screen showing a generic icon instead of vIDE's own
- Fixed the browser reload icon spinning in the wrong direction against its own arrowhead
- Fixed the Markdown editor/preview split view not reflecting edits until the tab was closed and reopened


## v0.2.12 (2026-09-12)
- **Notification system rework**: status bar alerts now live in a single shared panel with a priority teaser in the footer pill instead of separate ad-hoc messages; session and weekly usage alerts can show simultaneously, each with its own icon, and the footer text goes quiet after acknowledgment while the panel keeps listing every active item; added a compact bell toggle for narrow status bar widths, a wider footer pill and panel, a scrollable panel list, and a dismiss button on individual rows
- Failed git commits now raise a notification that opens the Git panel
- **Claude sessions**: added "Close All Sessions", and closing a session no longer refuses to close the last one — the chat panel collapses and Claude-dependent toolbar actions (Compact/Clear/Usage/Cost/Usage Graph/mute) disable themselves when no session is open
- **Markdown editor/preview split view**, with a configurable default open mode
- Git Graph and List Diff tabs can now open in the biggest pane
- **Memory usage breakdown popover**, showing app and Docker stats
- **To Do**: new `archive_todo` MCP tool, an "Archive All" action for the Done column (atomic bulk archive), and rename/delete support for todo projects
- Added Rockhoppers and Good Girl background images

**Bug fixes**
- Fixed a new Claude session always defaulting to the 2nd palette colour instead of the first colour not already in use
- Fixed the new-todo composer discarding a typed title on blur instead of keeping it as a draft
- Fixed the Todo board losing each column's scroll position across remounts (e.g. after opening a card's detail page)
- Fixed usage panel columns shrinking and wrapping text on narrow widths


## v0.2.11 (2026-09-11)
- **Multi-repo Git panel rework**: repos now start closed in a multi-repo project — pick which ones you're working on from a new "Show All Repos" palette (search, star-to-favorite, matching the Branch/Command Palette look) instead of an inline overview; an opened repo's header gets a right-click menu for Reveal in File Tree, Close Repo, and Close All Repos, replacing the old always-visible icon buttons and header button
- Repos now expand one at a time (opening one collapses whichever was open before), and that expanded repo is always what the footer, activity-bar badge, and header highlight agree is "active" — switching editor tabs or expanding a different repo's section keeps everything in sync instead of drifting apart
- The footer's quick-switch menu now lists your open repos instead of favorites; the repo name now shows before the branch in single-repo projects too
- **Graphify scoped to the active repo**: building or viewing a graph in a multi-repo project now only scans the repo you're actually working on instead of the whole project folder — fixes a real performance problem on large umbrella-folder setups. The panel shows which repo it's targeting, and Build/Open Graph/Open Report moved to the bottom
- New opt-in "Auto-build graph when a repo is opened" setting in Settings > Graphify (off by default, with a resource-usage warning when enabled)
- Graphify's "not installed" state now has a quick-launch button that opens a terminal with the install command copied and ready to paste

**Bug fixes**
- Fixed the Git panel, footer, and activity-bar badge showing a repo's name or change count before any repo was actually opened in a multi-repo project
- Fixed switching editor tabs, or expanding a different repo's header, not updating which repo the footer and active-repo highlight pointed at


## v0.2.10 (2026-09-09)
- **Gabriele theme**: a new grayscale theme family — pure neutral grays throughout, no colour tint — with a matching background image
- **Editor Colors renamed, and smarter with custom themes**: "High Contrast" is now "Theme Colour Match" and auto-derives its syntax colours from a custom theme's own accent instead of falling back to the base family's fixed palette; "Mario Mode" is now "High Contrast (Mario Mode)"; the Default and Theme Colour Match schemes now also follow a custom theme's own background colour
- **Browser landing page**: opening a browser tab with nothing loaded yet now shows your favorited pages, recently visited pages, and recently closed tabs (with one-click reopen) instead of a blank page — star the toolbar button to favorite/unfavorite the current page
- **Claude browser tab handoff**: Claude can take over one of your open browser tabs to navigate and interact with it on its own, then hand it back when done
- **Expanded browser MCP toolset**: added get_html, evaluate, and get_network_log, plus tools for waiting, scrolling, key presses, finding elements, reading response bodies, exporting to PDF, reading the accessibility tree, and inspecting certificates
- **Clear Browsing Data**: a new toolbar action clears cache/cookies/history, alongside a new Home button (placed before Back)
- Added a "Close side panel when opening" option to Browser settings — collapses the open sidebar to give a new browser tab the full width
- Browser tab views are now created only once a tab actually navigates (showing the landing page until then), so the old Default URL setting was removed as redundant

**Bug fixes**
- Fixed custom theme colours — including the terminal and editor background — not respecting the Glossy/Glass panel style, and occasionally turning solid black when a theme was created or edited while Glossy or Glass was active
- Fixed "Theme Colour Match" forcing the editor fully opaque under the Glass panel style instead of following it like every other scheme
- Fixed browser tabs showing a guessed file-extension icon instead of a fixed page icon
- Fixed landing-page monogram icons showing a different letter per page instead of one per site
- Fixed assorted navigation, closed-tab-reopen, and view bounds/unmount issues introduced by the tab handoff and deferred-view-creation changes


## v0.2.9 (2026-09-08)
- **Multi-instance Claude sessions**: run several Claude Code sessions side by side, each with its own terminal panel; the new-session button moved next to the assistant icon, the busy-session indicator now tints per instance, and a right-click menu on each session tab adds Continue/Resume/Compact/Clear (Previous/Resume moved out of the toolbar into this menu)
- **Custom Themes**: build your own named theme with independent light/dark palettes, edited with a hue/saturation colour picker (hex/RGB input, a recently-used swatch tray), right-click to edit/delete/share a theme, instant creation with auto-numbered names, a "Copy from Light/Dark" shortcut while editing, and the terminal background now follows the active custom theme
- **Borahae theme**: a new purple theme family — BTS/ARMY's "I purple you" — with its own background art
- **Editor Colors**: a new Display setting for the Monaco editor's syntax colours — "High Contrast" (bright, tied to each theme's own accent) and "Mario Mode" (a fixed, maximum-contrast palette) — for easier reading regardless of eyesight
- **Panel Style**: replaced "Matt" with "Brush Metal", now with a real brushed-metal grain and sheen texture; Glossy and Glass also got visual improvements
- **Font**: its own Display settings section with a live preview card per font, plus the global UI font-size control moved up from the footer
- **Backgrounds**: their own Display settings section with card previews; added Atreus, Link, Tech Lines, Borahae, and Wave background images, and the background now swaps automatically to match whichever theme family is active
- **Settings navigation**: Claude and Bridge split into separate pages under a new grouped sidebar (General / Models / Source Control / Integrations / Productivity); every settings page now shows its own icon next to its title; Bridge, Git, Docker, Mobile, and Graphify settings restyled onto the shared Section/Row/Field layout
- **"Always open in biggest pane"**: added to Notes, To Do, Jira, Browser, Git Remote, and Settings tabs, and now defaults to on everywhere
- **Removed Codex support**: vIDE no longer integrates the OpenAI Codex CLI as an agent panel — Claude Code and Bridge remain
- Renamed the Navbar-on-right toggle to "Navbar on the right (Gabby Style)"
- The setup wizard's Panel Style and Background pickers now use the same visual card pickers as Display settings, instead of plain dropdowns

**Bug fixes**
- Fixed right-click context menus (and the theme colour picker's own popover) not taking a custom theme's colours
- Fixed Panel Style previews in Display settings shifting to match whichever style was actually active, instead of showing their own look
- Fixed vertical alignment between a Toggle's label and its switch
- Fixed Docker status flicker under daemon load with debounced events and stale-refresh guarding


## v0.2.8 (2026-09-02)
- **Docker panel overhaul**: containers are now grouped by compose project with batch Start All/Stop All/Remove All controls, right-click context menus on both groups and individual containers (replacing the old kebab menus), and an "Open in Docker" action to jump to a container in Docker Desktop
- Docker panel header gained a Close Docker action (with confirmation) and an actions menu in place of the standalone Refresh button
- A footer alert now appears when Docker is enabled but the Docker daemon isn't running
- Docker status indicator moved into a chip beside the panel title, with an optional memory usage display on container rows and group memory aggregation
- Docker activity bar icon now shows a running-container badge, configurable to count containers or projects
- Redesigned the Docker panel empty state with a new icon and Launch Docker button, plus loading spinners and disabled states on container actions while requests are in flight


## v0.2.7 (2026-08-30)
- **Cost panel**: estimated Claude spend tracking with a per-model pricing table
- **Claude-controlled browser tab**: new MCP tools let Claude navigate, screenshot, click, type, and read within its own browser tab, replacing the old "open URL" shim
- **Resume session**: a picker command lets Claude resume any previous session, not just continue the latest one
- **Fullscreen toggle** for browser tabs
- **Mobile Display toggle**: enable/disable Mobile Display from Settings
- **Themes**: replaced the Codex theme family with Link Dark/Light and Atreus Dark/Light
- Claude now plays a completion sound when it finishes a real reply
- Usage alert footer now shows a live HH:MM:SS countdown to the projected cutoff
- Usage Graph: gaps in usage data are now handled with time-based downsampling and dashed prediction lines across real gaps, and each metric remembers its own selected range
- Redesigned the compact sidebar icon as converging chevrons, with refreshed activity bar icon hover styling

**Bug fixes**
- Fixed mouse-wheel scroll speed and scrollbar thumb visibility in the terminal
- Inline autocomplete is temporarily disabled pending a rework


## v0.2.6 (2026-08-29)
- **Notes search**: a search button in the Notes panel header toggles a search box that matches note titles and content across your whole library, not just expanded folders — press "/" to jump to it, same as the To Do board's search
- **To Do search and author tracking**: a search box filters the To Do board and archive by title/description, and comments/cards now record which author (you or Claude) made them
- **To Do right-click menu**: cards and columns get a context menu for duplicate, move, archive, and column sort options
- **Claude Code To Do enforcer**: enabling the existing "Let Claude see & manage your todos" toggle now also installs a plugin that stops Claude from ending a turn without leaving a progress comment on whichever ticket it started working on
- **Usage burn-rate footer alert**: when Claude usage is projected to run out before the session or weekly reset, the footer shows an alert linking to the Usage Graph — persists until usage is back on track
- Redesigned the confusing autocomplete footer icon as a plain "Abc" label, with a diagonal slash when paused
- Restyled the footer font-size control to match the browser tab's zoom control (rounded pill, +/− icons, click to reset)
- To Do board now remembers its last view (board/archive) and the last opened project across restarts
- Sidebar navbar icons for Git/Docker/Mobile Display/Graphify are now hidden when no project is open; Browser and Terminal work without one

**Bug fixes**
- Fixed the To Do detail tab staying open after archiving its ticket
- Fixed To Do board columns not scrolling and cards shrinking when a column had many cards
- Fixed the "Select a project" empty state sinking to the bottom of the sidebar when there were no recent projects yet
- Fixed browser tabs occasionally surviving as orphaned overlays after reloading the window


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