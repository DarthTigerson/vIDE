# Image and SVG viewer extensions (VIDE-27)

## Problem

A PNG opened from a Claude chat link shows as binary garbage in the editor.
The file tree already opens images in `ImageViewer` (image-preview tab, see
`src/components/Viewer/paths.ts`), but `openFileAtLocation`
(`src/lib/openFileLocation.ts`, used by chat links, go-to-definition and
search) reads every file as text. Other entry points may have the same gap.

## Decisions (agreed with Keith, 2026-11-04)

1. **Extensions are a new kind of entry in All Apps.** All Apps gets an
   "Extensions" section. An extension has a title, icon, an Enable switch and
   a settings page, but no sidebar panel and no activity-bar icon (it only
   changes how files open). Two extensions ship now: **Image viewer** and
   **SVG viewer**. Both are enabled by default.
2. **SVG offers every view mode, the user picks.** Modes:
   - `preview`: rendered only.
   - `toggle`: rendered, with a button to switch to the editable XML source
     and back (like the markdown preview/editor pair).
   - `split`: rendered preview beside the editable source, preview updating
     live from the unsaved buffer.
   The default mode is a setting on the SVG viewer's settings page (default
   `toggle`). Every SVG tab also has a small mode switcher so the user can
   change mode for that tab at any time.
3. **When an extension is off, ask instead of showing garbage.** Opening a
   file the disabled extension would handle opens a notice tab (not Monaco):
   "<Extension> is turned off" with an **Enable** button (turns the extension
   on and reopens the file in its viewer). For SVG the notice also offers
   **Open as text**. Binary images are never loaded into Monaco.

## Design

- **Extension registry** (`src/lib/extensions.ts` or similar): id, title,
  icon, which files it handles (`isImageFile` minus svg, `.svg`). Enabled
  state persisted in localStorage under a `vide:` settings key so vIDE Sync
  carries it, with `notifySettingChanged` like other settings. A small
  Zustand store exposes `isEnabled(id)` / `setEnabled(id, on)`.
- **One routing function** for "open this path": decides image viewer, SVG
  viewer, disabled-notice, markdown (existing behaviour) or text. Every entry
  point uses it: file tree, Sidebar context menu, pane drag/drop
  (`PaneDropZoneOverlay`), chat file links and go-to-definition
  (`openFileAtLocation`), search results, Action Palette file commands.
  `openFileAtLocation` with a line/col on an image just opens the viewer.
- **SVG viewer**: new viewer component and tab path kind (alongside the
  image-preview one). Preview renders the SVG via an `<img>` data/blob URL
  (no inline SVG in the DOM, so scripts inside the SVG never run). Source
  editing uses the normal editor tab for the file so save, dirty state and
  git gutter keep working.
- **Settings pages**: one `settings://` page per extension (Enable switch;
  SVG adds the default-mode choice). Each needs its row in `SETTINGS_PAGES`
  (`src/components/Search/pageCommands.ts`), a test enforces this.
- **All Apps**: an "Extensions" section listing both, each row showing its
  on/off state with Enable/Disable and Settings actions (reuse the existing
  context menu patterns).

## Out of scope

Third-party extension loading, other file types, image editing.
