# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

vIDE is an Electron desktop app ("a Claude-native IDE"): a Monaco editor,
a real terminal (`node-pty`), and git tooling built around one or more AI
coding agent panels (Claude Code CLI, OpenAI Codex CLI, and "Bridge" for any
OpenAI-compatible local LLM endpoint) running side-by-side. vIDE launches
these CLIs as terminal processes — it does not reimplement agent logic.

## Commands

```bash
npm run dev            # electron-vite dev — launches the app with HMR
npm run build           # electron-vite build (type-checks via tsc, then bundles)
npm test                 # vitest run — full suite
npx vitest run <path>     # run a single test file
npx vitest <path>          # watch mode for a single test file
npm run rebuild            # rebuild native node-pty module against Electron's ABI
npm run dist:mac            # build + package a macOS .zip (release/)
npm run dist:linux           # build + package a Linux .tar.gz (release/)
```

There is no separate lint script; type errors surface via `npm run build`
(`tsc -b` runs before the Vite build for both `tsconfig.node.json` and
`tsconfig.web.json`).

Tests are colocated in `__tests__` directories next to the source they
cover (e.g. `src/components/Git/__tests__/`, `electron/__tests__/`).
Component tests (`.test.tsx` under `src/components/**/__tests__/`) run in
`jsdom`; everything else (stores, lib, electron main-process code) runs in
plain `node`, per the `environmentMatchGlobs` split in `vitest.config.ts`.

## Architecture

**Three-tier IPC structure**, consistent across every feature:

1. **Electron main process** (`electron/*.ts`) — one file per domain (e.g.
   `git.ts`/`gitRunner.ts`/`gitWatcher.ts`, `claude.ts`, `bridge.ts`,
   `pty.ts`, `mobile.ts`, `fsOps.ts`, `autocomplete.ts`, `inlineEdit.ts`,
   `usageManager.ts`/`usagePoller.ts`, `lsp/manager.ts`+`lsp/servers/*.ts`).
   Each registers its own
   `ipcMain.handle`/`ipcMain.on` calls, generally via a `register*Handlers()`
   function wired up in `electron/main.ts`. Long-lived per-domain state
   (running PTYs, watchers, servers) lives in manager classes here, not in
   the renderer.
2. **Preload bridge** (`electron/preload.ts`) — a flat `window.api` surface
   built with `contextBridge.exposeInMainWorld`, one method per IPC channel,
   plus `on*` subscription helpers that return an unsubscribe function for
   push-style events (log streams, file-watcher changes, etc.).
3. **Renderer** (`src/`) — React + Zustand. Each feature has a store under
   `src/stores/` (e.g. `gitStore.ts`, `claudeStore.ts`, `mobileStore.ts`)
   that calls `window.api.*` and holds UI/domain state; components under
   `src/components/<Feature>/` consume the store. `src/App.tsx` is the
   composition root: it lays out the activity bar, sidebar, editor, and
   per-assistant terminal panels inside resizable `react-resizable-panels`
   groups, and owns top-level modal/palette state.

**Multi-instance panels**: Claude/Codex/Bridge terminal panels and browser
tabs are addressed by path-like IDs built via helpers such as
`buildTerminalPath`/`buildBrowserPath` (`src/components/Settings/paths.ts`),
allowing multiple concurrent instances per assistant kind
(`AssistantKind` in `src/types/api.ts`: `'claude' | 'codex' | 'bridge'`).

**Mobile Display**: `electron/mobile.ts` runs a local HTTP server
(`MobileServer`) that a phone pairs to over the LAN via QR code + PIN; the
served web assets live in `electron/mobileWeb/` and are included verbatim
in packaged builds (see `build.files` in `package.json`), not bundled by
Vite.

**Go-to-definition (Cmd+click)**: `electron/lsp/manager.ts` owns one real
language-server child process per `(window, language)` pair — TypeScript/
JavaScript, Python, Go, and Rust — spawned lazily only once a language is
toggled on in Settings > Editor *and* a file of that language is actually
open (`electron/lsp/servers/*.ts` hold each language's detect/spawn/install
commands; `electron/lsp/protocol.ts` is a minimal LSP JSON-RPC client).
`src/lib/lspClient.ts` registers Monaco's `DefinitionProvider` on the
renderer side; the Cmd+click gesture itself is a Monaco/VS Code built-in
that needs no custom wiring. Cross-file jumps are handled manually via
`editorStore`'s `openTab`/`setRevealRequest` (the same path Search-in-files
uses) rather than Monaco's own cross-model handling, which is unreliable
outside the full VS Code workbench.

**Design-doc workflow**: nontrivial features go through a brainstorm →
spec → plan cycle before implementation, with artifacts committed to
`docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` and
`docs/superpowers/plans/YYYY-MM-DD-<topic>.md`. Check these directories for
prior art/rationale before redesigning an existing feature.

**Platform support**: macOS (Apple Silicon only) and Linux (x86_64,
Debian/Ubuntu-based) — no Intel Mac, no Windows.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## Research workflow

(Kept outside the `## graphify` heading above deliberately — that section's
content is regenerated by `graphify install --platform claude --project`
[the Settings > Graphify "Enable for Claude Code" button], so anything
added inside it gets silently dropped on the next install/update run.)

Prefer `graphify query`/`explain`/`path` over spawning an Explore/general-purpose
subagent, or a manual grep/Read sweep, for "where does X live" / "how does A
relate to B" discovery questions. `graphify query` returns a token-bounded
scoped subgraph (roughly a 2,000-token budget, explicitly truncated with
guidance on narrowing further) — an agent doing equivalent research by
reading files directly can cost tens of thousands of tokens for the same
question. Still fall back to an agent/grep when the graph comes back too
thin, when verbatim source is needed to copy exact patterns/line numbers for
editing, or for runtime/git state the static graph can't capture.

If a graphify command errors with something like "no such file" (a stale
node pointing at a path that's since been moved/renamed/deleted), run
`graphify update .` to rebuild the graph — this also regenerates
`graphify-out/GRAPH_REPORT.md`, so re-open/re-read the report afterward
rather than trusting the stale one.
