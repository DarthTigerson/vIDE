# Built-in image and SVG viewers (VIDE-27)

## Problem

A PNG opened from a Claude chat link shows as binary garbage in the editor.
The file tree already opens images in `ImageViewer` (image-preview tab, see
`src/components/Viewer/paths.ts`), but `openFileAtLocation`
(`src/lib/openFileLocation.ts`, used by chat links, go-to-definition and
search) reads every file as text. Other entry points may have the same gap.

## Decisions

1. **Viewers are built in, not optional.** Images and SVGs always open in
   their viewer. There is no on/off switch, no settings page and no entry in
   All Apps. (An earlier draft made them toggleable "extensions" listed in
   All Apps; dropped on 2026-11-06 because turning a viewer off saves no
   resources, it only makes opening an image worse. The viewer costs nothing
   until an image is opened.)
2. **SVG offers every view mode, the user picks.** Modes:
   - `preview`: rendered only.
   - `toggle`: rendered, with a button to switch to the editable XML source
     and back (like the markdown preview/editor pair).
   - `split`: rendered preview beside the editable source, preview updating
     live from the unsaved buffer.
   The default mode lives in Settings > Editor, next to the markdown open
   mode (default `toggle`). Every SVG tab also has a small mode switcher so
   the user can change mode for that tab at any time.
3. **Binary images are never loaded into Monaco.**

## Design

- **One routing function** for "open this path" (`src/lib/openFile.ts`):
  decides image viewer, SVG viewer, markdown (existing behaviour) or text.
  Every entry point uses it: file tree, Sidebar context menu, pane drag/drop
  (`PaneDropZoneOverlay`), chat file links and go-to-definition
  (`openFileAtLocation`), search results, Action Palette file commands.
  `openFileAtLocation` with a line/col on an image just opens the viewer; on
  an SVG it opens the source so the jump lands.
- **TIFF and HEIC**: `<img>` cannot decode them, so the main process converts
  them to PNG with `nativeImage` (`readImagePngDataUrl` in
  `electron/fsOps.ts`). When the OS cannot decode the file (e.g. HEIC on
  Linux) the viewer says the preview is unavailable.
- **SVG viewer**: new viewer component and tab path kind (alongside the
  image-preview one). Preview renders the SVG via an `<img>` data/blob URL
  (no inline SVG in the DOM, so scripts inside the SVG never run). Source
  editing uses the normal editor tab for the file so save, dirty state and
  git gutter keep working.

## Out of scope

A plugin/extension system, other file types, image editing.
