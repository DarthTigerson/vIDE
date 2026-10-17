// A command queued to run as soon as a fresh terminal with this id finishes
// spawning — e.g. the file tree's "Run" action on a .sh file, or a script
// run, which opens a brand-new terminal and needs the text to execute in it.
// Set this before opening the tab; TerminalTab writes and clears it once its
// own spawn promise resolves, so the write can never race ahead of the PTY
// existing.
export const pendingTerminalCommands = new Map<string, string>()
