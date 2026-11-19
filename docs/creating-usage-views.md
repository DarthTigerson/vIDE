# Creating usage views

A usage view is a Store app that draws the **usage panel**: the Claude
session and weekly limits at the bottom of the sidebar. vIDE ships one view
built in, **Bars**. Anything else is installed from the Store's **Usage**
category. Users pick a view with **right-click on the panel › View**.

- Reference view: **Bike Gauge**, a speedometer for the session and a fuel
  gauge for the week. Repo `DarthTigerson/vide-bike-guage-usage`.
- Requires vIDE **0.3.7** or later. Set `"minVide": "0.3.7"`.

This page covers only what is specific to usage views. For the manifest,
build, styling, local testing and releases, read
[creating-apps.md](creating-apps.md) first.

## What vIDE does and what the view does

vIDE owns the data:

- It polls usage and works out burn rate and cutoff.
- It runs the 1-second clock.
- It shows "No usage data yet" before the first poll.
- It owns the right-click menu: View, Preferences…, Store….

The view only draws what it is given. It never fetches usage and never calls
`window.api`.

```
usage poller ──▶ vIDE usage panel ──{ session, week, now }──▶ your component
                      │
                      └── right-click: View ▸ Bars / <your view> · Preferences… · Store…
```

## The API

```ts
vide.usage.registerView({ title: string, component: ComponentType<UsageViewProps> }): Disposable
vide.usage.pace(window: UsageWindow, now: number): UsagePace
```

Types (from `src/apps/videApiTypes.ts`; copy it into your repo as
`src/vide.d.ts`):

```ts
interface UsageViewProps {
  session: UsageWindow   // the 5-hour session limit
  week: UsageWindow      // the 7-day limit
  now: number            // epoch ms, ticks every second
}

interface UsageWindow {
  label: string              // 'Session' or 'Week'
  pct: number | null         // 0–100 used; null = unknown
  resetAt: number | null     // epoch ms of the next reset
  ratePerHour: number | null // average burn, percentage points per hour
  cutoffAt: number | null    // epoch ms the limit is predicted to run out; null = it won't before reset
  windowHours: number        // 5 for session, 168 for week
}

interface UsagePace {
  elapsedPct: number | null    // how far through the window time is (0–100)
  projectedPct: number | null  // usage projected at reset at the current rate (capped at 100)
  status: 'under' | 'ahead' | 'runs-out' | null
}
```

Rules:

- **One view per app.** The menu lists it under its `title`.
- **Use `vide.usage.pace`** for any "on pace / ahead / runs out" verdict. Do
  not do your own maths. This way every view agrees with Bars.
- **Handle nulls.** Each field can be null on its own. For example, `pct` is
  known but `resetAt` is not yet. Draw a dash or leave the part out. Never
  draw `NaN%`.
- **Treat `pct >= 100` as out of usage.** Bike Gauge lights its fuel warning
  red at that point.
- **Keep it cheap.** The component re-renders every second. Do not start
  timers, fetch anything or animate on every tick.
- **Fit the sidebar.** The panel is the sidebar's width, usually 260–500 px,
  and its height follows your content. Use an SVG with a `viewBox` and
  `width: 100%`, or a layout that wraps.

## Minimal view

```tsx
// src/renderer/index.tsx
import type { Disposable, UsageViewProps, VideRendererApi } from '../vide'

let vide: VideRendererApi
let reg: Disposable | null = null

function MyView({ session, week, now }: UsageViewProps) {
  return (
    <div className="flex flex-col gap-2 text-xs text-fg-muted">
      {[session, week].map((w) => {
        const p = vide.usage.pace(w, now)
        return (
          <div key={w.label}>
            {w.label}: {w.pct == null ? '—' : `${Math.round(w.pct)}%`}
            {p.status === 'runs-out' && <span className="text-amber-400"> · runs out early</span>}
          </div>
        )
      })}
    </div>
  )
}

export function activate(v: VideRendererApi): void {
  vide = v
  reg = v.usage.registerView({ title: 'My View', component: MyView })
}

export function deactivate(): void {
  reg?.dispose()
  reg = null
}
```

A view needs only `renderer.js`, with no `main.js`. Keep `vide` in a
module-level variable, because the component gets data props, not the API
(see Bike Gauge's `src/renderer/vide.ts`).

## Manifest

```json
{
  "id": "my-view",
  "name": "My View",
  "description": "One line for the Store card.",
  "version": "0.1.0",
  "apiVersion": 1,
  "minVide": "0.3.7",
  "renderer": "renderer.js",
  "style": "style.css",
  "icon": "assets/icon.svg",
  "screenshots": ["assets/screenshot-1.png", "assets/screenshot-2.png"],
  "contributes": {}
}
```

## Preferences

To give the view options, such as units, colours or whether to show the
footer, register a settings page:

```ts
vide.ui.registerSettingsPage({ title: 'My View', component: MySettings })
```

**Preferences…** then appears in the panel's menu while your view is active
and opens that page. Store options with `vide.settings.get/set/subscribe`.
Keys are saved as `vide:<appId>:<key>`. Without a settings page,
Preferences… stays hidden.

## Styling

- Everything your view renders sits inside `.vapp-<appId>`. Scope your CSS to
  that class. Docker, Git Page and Bike Gauge all use Tailwind with
  `important: '.vapp-<id>'` and `preflight: false`.
- Use vIDE's theme variables, such as `var(--color-fg)`,
  `var(--color-fg-muted)`, `rgb(var(--color-accent))` and
  `var(--color-border)`, so the view follows the user's theme. Bike Gauge's
  needle and arc take the accent colour.
- Check the view in a dark theme and a light theme.

## Screenshots

The Store page shows `screenshots` from the manifest. Take at least two:

1. a normal state;
2. a busy state, such as close to the limit or "runs out".

Each shot shows the view at a typical sidebar width, about 500 px, at 2x.

To take them without clicking around the app, render the built
`dist/renderer.js` in a tiny page and capture it with Electron. This is how
Bike Gauge's shots were made:

1. Write a page that sets `globalThis.__videShared = { react, reactDom,
   jsxRuntime }` and imports `dist/renderer.js`. It then calls `activate()`
   with a stub `vide`. The stub needs `usage.registerView`, which keeps the
   component, and `usage.pace`, a copy of the maths in
   `src/components/UsagePanel/pace.ts`. Finally it renders the component with
   sample `session`, `week` and `now` values.
2. Add `dist/style.css` and one `[data-theme="…"]` block copied from vIDE's
   `src/index.css`, for example `atreus-dark` or `thomas-dark`. Set
   `data-theme` on `<html>`. Wrap the view in a `.vapp-<appId>` element inside
   a box styled like the panel: `background: var(--color-sidebar)`, a
   `border-top` in `var(--color-border)` and `padding: 12px 16px`.
3. Run Electron with `--force-device-scale-factor=2`. Load the page in a
   hidden `BrowserWindow`, wait for render, call
   `webContents.capturePage()` on the panel's box and write the PNG to
   `assets/`.

Use fixed sample data and a fixed `now`, so retaking a shot after a change
gives the same picture.

## Testing

- Unit-test the component with vitest and jsdom. Render it with sample
  windows, stub `vide.usage.pace` with a copy of the panel's maths, and
  assert on the text and `data-testid`s. Cover at least these cases:
  - normal;
  - `pct` null;
  - no `resetAt`;
  - `cutoffAt` set;
  - `pct` at 100.
- Check the view in vIDE itself:
  1. Run `npm run dev`. The local vIDE must be 0.3.7 or later.
  2. Run **Load app from folder…** and pick `dist/`.
  3. Right-click the usage panel and choose **View** › your view.

## Publishing

Release like any app (see [creating-apps.md](creating-apps.md)):

1. Name the repo `vIDE-<Name>-Usage`.
2. Push a `v*` tag. The workflow builds the GitHub Release with
   `<id>-<version>.zip`.
3. List the repo in `forebeacon/vsuite-store`'s `apps.json` with
   `"category": "usage"`:

```json
{ "repo": "https://github.com/<owner>/vIDE-MyView-Usage", "category": "usage" }
```

The view then shows under **Usage** on vsuite.tech. It also shows in vIDE's
Store, which the panel's **Store…** menu item opens on that category.
