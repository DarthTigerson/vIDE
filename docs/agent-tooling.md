# Agent tooling

Agent tools are functions an AI agent can call while it works, such as web
search. In vIDE they come from two places:

- **Built-in servers** that vIDE ships and registers itself: `vide-browser`,
  `vide-todos`, `vide-notes`, `vide-scripts`, `vide-docs`.
- **Store apps** that declare tools in their manifest, such as DuckDuckGo's
  `web_search`.

This document covers the second kind: how to give an app tools. For apps in
general (manifest, build, release), see [creating-apps.md](creating-apps.md).
Reference app: `DarthTigerson/vIDE-DuckDuckGo-MCP`.

## The model: vIDE is the middle man

Apps never run their own MCP server and never call `claude mcp add`.
Instead:

```
Claude Code ──stdio──▶ vide-apps MCP server ──socket──▶ vIDE main ──▶ app main.js handler
Bridge      ─────────────── in-process ───────────────▶ vIDE main ──▶ app main.js handler
```

- vIDE registers **one** MCP server, `vide-apps`
  (`electron/mcp/appsMcpServer.ts`). When a Claude session starts, the server
  asks vIDE for the tools of every installed and enabled app and serves the
  full list. It reaches vIDE through `VIDE_WINDOW_ID` and
  `VIDE_BROWSER_SHIM_SOCK`.
- A tool call is forwarded over that socket (`/app-tools/call`) to vIDE, which
  runs the app's handler in its `main.js` (`AppHost.callAgentTool`).
- Bridge gets the same tool list and calls the AppHost directly
  (`appToolSet` in `electron/mcp/appsTools.ts`).
- The full list is always offered. The model decides when to use each tool.

Consequences:

- A newly installed or enabled app's tools show up in the **next** agent
  session, not the current one.
- Secrets such as API tokens live in the app's own settings (`vide.settings`,
  set from the app's settings page) and are read inside vIDE. They never go
  into a Claude config file.
- Outside a vIDE-launched session, or if vIDE cannot be reached, `vide-apps`
  serves zero tools rather than breaking the CLI's startup.

## Declaring tools

Add a top-level `agentTools` block to `manifest.json`:

```json
{
  "id": "duckduckgo",
  "name": "DuckDuckGo",
  "version": "0.1.0",
  "apiVersion": 1,
  "minVide": "0.3.0",
  "renderer": "renderer.js",
  "main": "main.js",
  "contributes": {},
  "agentTools": {
    "instructions": "Use web_search to look things up online — docs, error messages, library APIs, current information.",
    "tools": [
      {
        "name": "web_search",
        "description": "Search the web and get back a ranked list of results (title, URL, snippet).",
        "inputSchema": {
          "type": "object",
          "properties": {
            "query": { "type": "string", "description": "The search query" },
            "maxResults": { "type": "number", "description": "How many results to return (default 8, max 15)" }
          },
          "required": ["query"]
        }
      }
    ]
  }
}
```

Rules (`parseAgentTools` in `electron/apps/appManifest.ts`):

| Field | Rule |
|-------|------|
| `name` | Matches `^[a-z][a-z0-9_]{0,63}$` and is unique within the app. |
| `description` | Non-empty. This is what the model reads to decide whether to use the tool, so say what the tool returns and when to use it. |
| `inputSchema` | A JSON Schema object with `"type": "object"`. |
| `tools` | At most 32. Extra tools are ignored. |
| `instructions` | Optional. Added to the `vide-apps` server instructions. It is a good place for guidance that spans several tools, for example "fetch a result with browser_navigate". |

A malformed tool is dropped without failing the install. If every tool is
dropped, the app has no tools.

**Name clashes.** A tool whose name is already taken by a built-in vIDE tool or
by an app earlier in id order is skipped, with a console warning. Pick
specific names (`docker_list_containers`, not `list`).

An app with only tools still needs a `renderer.js`. Its `activate` can be
empty:

```ts
// src/renderer/index.ts
export function activate(): void {}
```

## Handling calls

Register a handler for each declared tool in `main.js`:

```ts
// src/main/index.ts
export function activate(vide: MainVideApi): void {
  vide.agentTools.handle('web_search', async (args, ctx) => {
    const query = String(args.query)
    const results = await webSearch(query, args.maxResults as number | undefined)
    return formatSearchResults(results, query)
  })
}
```

- `vide.agentTools.handle` throws if the name is not declared in the
  manifest.
- `args` is the model's input object. Validate it yourself, because the schema
  is guidance to the model and is not enforced.
- `ctx.windowId` is the calling vIDE window, when known. Pass it to
  `vide.process.exec`/`spawn` so child processes die with the window.
- Return a `string` or `{ text }`. The text goes back to the model as-is, so
  keep it compact and readable, such as a list or short sections, not a raw
  JSON dump.
- Throw for errors. The message reaches the model, so make it actionable
  ("docker is not running").
- A call that takes longer than **60 seconds** fails with
  "`<name>` did not finish within 60s" (`AGENT_TOOL_TIMEOUT_MS`).
- A declared tool whose handler was never registered fails with
  "`<App>` did not register `<name>`".

Keep the logic in pure, unit-tested functions, such as DuckDuckGo's
`webSearch.ts` parser, and keep the handler thin.

## Where users see tools

- **Settings › Integrations › Agent Tooling**
  (`AgentToolingSettingsPage.tsx`) lists the built-in tools and each app's
  tools, with a link to get more from the Store.
- An app's Store page lists its tools, including when the app is disabled.
- Disabling or uninstalling the app removes its tools from the next session.

## Listing on the Store

Release the app like any other app (see [creating-apps.md](creating-apps.md)).
In `forebeacon/vsuite-store`'s `apps.json`, use `"category": "agent-tools"`:

```json
{ "repo": "https://github.com/DarthTigerson/vIDE-DuckDuckGo-MCP",
  "category": "agent-tools", "recommended": true, "replacesBuiltIn": "web-search" }
```

## Testing

1. Load the built `dist/` as a dev app (palette: **Load app from folder…**,
   dev builds only).
2. Start a **new** Claude or Bridge session. `vide-apps` reads the tool list
   only when a session starts.
3. Ask the agent to use the tool. Check that the reply text is what you want
   the model to read.
4. Unit-test the handler's pure logic with vitest in the app repo.
