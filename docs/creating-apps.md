# Creating vIDE apps

A vIDE app is a feature that lives outside vIDE's own code. It ships as a zip
from its own GitHub repo, is listed on the vSuite Store (vsuite.tech and the
Store page inside vIDE), and is installed only by the people who want it.
Docker and DuckDuckGo are the reference apps:

| App | Repo | Shows |
|-----|------|-------|
| Docker | `DarthTigerson/vIDE---Docker-App` | Full UI: sidebar panel, settings page, editor tab kind, commands, notifications, a `main.js` that runs the `docker` CLI |
| DuckDuckGo | `DarthTigerson/vIDE-DuckDuckGo-MCP` | No UI, one agent tool (see [agent-tooling.md](agent-tooling.md)) |

When in doubt, copy one of them.

The source of truth for everything below is in this repo:

- `electron/apps/appManifest.ts` — manifest parsing and validation
- `src/apps/videApiTypes.ts` — the renderer `vide` API
- `electron/apps/mainVideApi.ts` — the main-process `vide` API
- `electron/apps/appHost.ts` — loading, activation, enable/disable, dev apps
- Design rationale: `docs/superpowers/specs/2026-11-15-vsuite-store-design.md`

## How an app runs

An app has two halves, both loaded by vIDE:

- **`renderer.js`** (required) — an ES module loaded into every vIDE window.
  Its `activate(vide)` registers UI: panels, tabs, settings, commands.
- **`main.js`** (optional) — a CommonJS module loaded once in vIDE's main
  process. Its `activate(vide)` registers methods the renderer can call, runs
  processes, and handles agent tools.

The two halves talk only through `vide.app.call(method, payload)` (renderer →
main) and `vide.app.emit(event, payload)` / `vide.app.on(event, cb)` (main →
renderer). There is no direct access to `window.api`, Electron, or vIDE's
stores: the `vide` object is the whole surface.

## Repo layout

```
manifest.json           app metadata (below)
package.json            scripts: build, test, package
build.mjs               esbuild → dist/
scripts/package.mjs     dist/ → release/<id>-<version>.zip
tsconfig.json
vitest.config.ts
tailwind.config.js      only if the app has UI (scoped, see Styling)
src/
  vide.d.ts             copy of the vide API types
  renderer/index.tsx    export function activate(vide) { ... }
  renderer/shims/       react, react-dom, jsx-runtime shims (UI apps)
  main/index.ts         export function activate(vide) { ... }
assets/
  icon.svg              Store/activity-bar icon
  screenshots...        optional, listed in manifest
store/
  README.md             the Store page's About text
.github/workflows/release.yml
```

Copy `build.mjs`, `scripts/package.mjs`, the shims and `release.yml` from the
Docker repo. Do not change the zip name: the catalog expects exactly one asset
named `<id>-<version>.zip` per release.

## manifest.json

```json
{
  "id": "docker",
  "name": "Docker",
  "description": "Start, stop and clean up containers from the sidebar.",
  "version": "0.1.1",
  "apiVersion": 1,
  "minVide": "0.3.0",
  "renderer": "renderer.js",
  "main": "main.js",
  "style": "style.css",
  "icon": "assets/icon.svg",
  "screenshots": ["assets/screenshot-1.png"],
  "contributes": {
    "sidebarPanel": { "title": "Docker" },
    "settingsPage": { "title": "Docker" },
    "tabKinds": ["logs"],
    "commands": true,
    "notifications": true,
    "agentTools": false
  }
}
```

| Field | Rule |
|-------|------|
| `id` | Lowercase id, unique across the Store. Also the zip name prefix, the CSS scope (`vapp-<id>`) and the settings key prefix. Never change it after release. |
| `name` | Display name. |
| `version` | `x.y.z`. The release workflow overwrites it from the tag. |
| `apiVersion` | `1`. A higher number is rejected as "built for a newer vIDE". |
| `minVide` | Oldest vIDE that can run the app. The default for apps is `0.3.0`. Raise it only when the app uses an API that older vIDE versions lack. Ask Thomas first. |
| `renderer` | Required. Path inside the package. |
| `main`, `style`, `icon` | Optional package-relative paths. They cannot start with `/`, contain `..`, or contain backslashes. |
| `description` | Optional Store page text. |
| `screenshots` | Optional. 1–8 package-relative paths. A bad list is dropped silently; it never fails the install. |
| `contributes` | Declares what the app uses. Booleans and titles only. The real registration happens in `activate`. |
| `agentTools` | Optional top-level block. See [agent-tooling.md](agent-tooling.md). |

A malformed manifest fails the install with a short reason (`bad id`,
`bad minVide`, and so on).

## Renderer API (`vide` in `renderer.js`)

```ts
export function activate(vide: VideRendererApi): void | Promise<void>
export function deactivate?(): void
```

| Area | What it gives |
|------|---------------|
| `vide.react`, `reactDom`, `jsxRuntime` | vIDE's own React. Never bundle React. The shims re-export it from `globalThis.__videShared`. |
| `vide.ui.registerSidebarPanel({ title, icon, component, requiresProject? })` | An activity-bar icon plus a sidebar panel. Returns `setBadge(n \| string \| undefined)`. |
| `vide.ui.registerSettingsPage({ title, component })` | A page under Settings. |
| `vide.ui.registerTabKind(kind, { title(params), component })` | An editor tab type. Open it with `vide.ui.openTab(kind, params)`. `params` must be JSON. |
| `vide.ui.openPanel()`, `openSettings()` | Focus the app's own panel or settings page. |
| `vide.ui.scopeClass` | `vapp-<id>`. Every app surface sits under it. |
| `vide.ui.components` | vIDE's own components, re-exported: `Switch`, `Toggle`, `Select`, `Modal`, `ConfirmActionModal`, `SettingRow`, `FeatureBlock`, `PreviewFrame`, `pillButtonClass`, `clampToViewport`, `useCoverNativeViews`. Use these so the app looks native. |
| `vide.terminal.View` | Read-only xterm for streamed output, such as logs. |
| `vide.commands.register(spec)` | Adds an Action Palette (`⌘⇧P`) command. Supports `disabledReason`, `danger` and `pick`. |
| `vide.notifications.push({ id, text, onClick? })`, `peek(text)` | Adds a pinned notification or shows a transient peek. |
| `vide.settings.get/set/subscribe(key)` | String settings, stored as `vide:<appId>:<key>` and synced by vIDE Sync like other settings. |
| `vide.project.root()`, `subscribe(cb)` | The open project folder, or `null`. |
| `vide.app.call(method, payload)`, `on(event, cb)` | Talk to the app's `main.js`. |

Every `register*` returns a `Disposable`. Keep them and dispose them in
`deactivate`, because disabling an app runs the renderer's `deactivate` without
a restart. `main.js` cannot be unloaded: when the app is disabled, vIDE kills
the children it started, but the module stays loaded until vIDE restarts.
Enabling the app again reconnects to that module.

## Main API (`vide` in `main.js`)

| Area | What it gives |
|------|---------------|
| `vide.app.handle(method, fn)` | Answers `vide.app.call` from the renderer. `fn(payload, { windowId })`. |
| `vide.app.emit(event, payload, { windowId? })` | Pushes an event to one window or to all windows. |
| `vide.process.exec(bin, args, { timeoutMs?, windowId? })` | Runs a binary to completion and returns `{ code, stdout, stderr, timedOut?, errorCode? }`. The binary is resolved through the user's login-shell PATH. |
| `vide.process.spawn(bin, args, handlers, { windowId? })` | Starts a long-running child and returns `{ kill() }`. Passing `windowId` kills the child when that window closes. |
| `vide.windows.onClose(cb)` | Runs `cb` when a window closes. |
| `vide.agentTools.handle(name, fn)` | Handles an agent tool declared in the manifest. See [agent-tooling.md](agent-tooling.md). |

`main.js` must never `require('electron')`. Bundle it as CJS for `node20`.

## Building

- **Renderer**: esbuild, `format: 'esm'`, `platform: 'browser'`, and
  `jsx: 'automatic'`. Alias `react`, `react-dom`, `react-dom/client`,
  `react/jsx-runtime` and `react/jsx-dev-runtime` to the shims. Define
  `process.env.NODE_ENV` as `"production"`.
- **Main**: esbuild with `format: 'cjs'`, `platform: 'node'` and
  `external: ['electron']`.
- Copy `manifest.json` and `assets/` into `dist/`, and copy `store/README.md`
  to `dist/README.md`.

## Styling

- An app stylesheet (`style`) is loaded only while the app is active.
- Scope every rule to `.vapp-<id>`. With Tailwind, set
  `important: '.vapp-<id>'` and `corePlugins: { preflight: false }`, and map
  colours to vIDE's CSS variables (`var(--color-bg)` and the rest) so themes
  keep working. Docker's `tailwind.config.js` shows the full mapping.
- Anything portalled to `document.body`, such as menus or modals, must be
  wrapped in an element with `vide.ui.scopeClass`. Otherwise the styles do not
  apply.

## Developing locally

1. Run vIDE unpackaged with `npm run dev`. Dev apps only work in dev builds,
   which use the separate `vIDE-dev` profile.
2. Build the app with `npm run build`.
3. In the Action Palette, run **Load app from folder…** and pick the app's
   `dist/` folder.
4. After each rebuild, load the folder again. vIDE drops Node's cached copy and
   reloads it under a fresh URL.
5. Run **Unload dev app: <name>** when finished.

A packaged vIDE can also install a built zip directly. Turn on
Settings › Store › *Install from file…*. Apps installed this way do not
update by themselves.

## Releasing

1. Push a `v1.2.3` tag in the app repo. `release.yml` writes the tag version
   into `manifest.json` and `package.json`. It then runs tests, `tsc`, the
   build and the package step, and creates a GitHub Release with the zip
   attached. A tag on its own is not enough. The Store reads only
   **Releases**.
2. The catalog repo, `forebeacon/vsuite-store`, lists each app once in
   `apps.json`:

   ```json
   { "repo": "https://github.com/DarthTigerson/vIDE---Docker-App",
     "category": "applications", "replacesBuiltIn": "docker" }
   ```

   - `category`: `applications` or `agent-tools`.
   - `recommended`: marks the app as recommended.
   - `replacesBuiltIn`: the id of a built-in feature the app replaces. Users
     who had that built-in feature turned on get a launch notification asking
     them to install the app.
3. The **Update catalog** Action regenerates `public/registry.json` and
   `public/apps/<id>/` from each repo's latest release. It runs hourly at :17,
   when started by hand, and on push. Never hand-edit `registry.json`. If the
   app repo has a `VSUITE_STORE_TOKEN` secret (Actions: write on
   `forebeacon/vsuite-store`), the release triggers the catalog refresh
   straight away.

If an app does not update on the Store, check in this order:

1. Does a Release exist, not just a tag?
2. Is exactly one zip attached, named correctly?
3. What does the catalog Action log say?

## Moving a built-in feature into an app

This is the pattern used for Docker and DuckDuckGo:

1. Find everything the feature touches, including stores, IPC, palette
   commands, settings pages, `SETTINGS_PAGES` rows, tests and mobile shims.
2. List what the feature needs that the `vide` API does not offer yet. Add
   that to vIDE first, keep it generic rather than feature-specific, and
   release it. Set the app's `minVide` to that vIDE version.
3. Build the app in its own repo and load it as a dev app until it matches the
   built-in feature.
4. Remove the built-in feature from vIDE. Add `replacesBuiltIn` to the catalog
   so existing users are prompted to install the app.
