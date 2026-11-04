import type { ITerminalOptions } from '@xterm/xterm'

// Options every xterm attached to a real PTY (shell terminals, Claude/agent
// panels) must share.
//
// convertEol must stay false for PTY output. The kernel's tty layer already
// turns the program's "\n" into "\r\n" (termios onlcr) for ordinary output,
// so the only bare "\n" that reaches xterm is one the program sent on
// purpose: terminfo's cursor-down (cud1 is "\n" for xterm), used by zsh's
// line editor and Claude Code's Ink renderer to redraw wrapped or multi-line
// input in place. With convertEol on, xterm adds a carriage return to every
// one of those, so the cursor jumps to column 0 mid-redraw and wrapped
// commands, pasted multi-line text and the chat input box render garbled
// (VIDE-17). Only non-PTY log viewers that write plain "\n" text themselves
// (Docker logs, Git Log) want convertEol.
export const PTY_XTERM_OPTIONS = {
  convertEol: false,
} as const satisfies ITerminalOptions
