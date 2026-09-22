// A scratch tab is a real, editable buffer that simply has no file behind it
// yet — deliberately NOT registered in tabKinds.ts's isVirtualTab/
// isReadOnlyTab, which are for tabs that host something other than a text
// editor. The id keeps several scratch tabs distinct, since the path is the
// tab's identity everywhere in editorStore. Saving one rewrites its path to
// the chosen file (see renameTabPath), after which it is an ordinary tab.
const SCRATCH_PREFIX = 'scratch://'

export function isScratchTab(path: string): boolean { return path.startsWith(SCRATCH_PREFIX) }
export function buildScratchPath(id: string): string { return SCRATCH_PREFIX + id }
export function getScratchId(path: string): string { return path.slice(SCRATCH_PREFIX.length) }
