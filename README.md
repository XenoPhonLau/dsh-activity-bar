# dsh-activity-bar

<p align="center">
  <a href="./LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-3b82f6?style=flat-square"></a>
  <img alt="DSH" src="https://img.shields.io/badge/DeepSeek%20Harness-0.2.1--rc.3-6366f1?style=flat-square">
  <img alt="Node" src="https://img.shields.io/badge/node-%E2%89%A522.13-339933?style=flat-square">
  <img alt="Platform" src="https://img.shields.io/badge/platform-Windows%20%C2%B7%20macOS%20desktop%20%C2%B7%20Web-0f172a?style=flat-square">
</p>

<p align="center">
  Turn the space freed by DSH's collapsed side panels into narrow icon rails, VS Code style — and give the width back to your workspace.<br>
  <sub><a href="./README.zh-CN.md">中文</a> · English</sub>
</p>

![Layout overview](docs/images/layout.svg)

> **Version**: `0.1.0`. Both switches, both rails and the settings page are implemented and covered by an offline self-test; real screenshots are still to come ([Screenshots](#screenshots)). Design notes and trade-offs live in [docs/DESIGN.md](docs/DESIGN.md) (Chinese).

---

## Why

DSH keeps its left sidebar and right bar open by default. Together they eat close to 40% of a 1920 CSS-wide window. With 44px rails, measured at that width:

| Setup | Left | Workspace | Right | Workspace vs. today |
| --- | ---: | ---: | ---: | ---: |
| Today (both panels open) | 279 | 1171 | 466 | — |
| Right rail only | 279 | 1597 | 44 | **+36%** |
| Left rail only | 44 | 1410 | 466 | **+20%** |
| Both rails | 44 | 1832 | 44 | **+56%** |

Nothing disappears: every entry that used to sit in a panel becomes one icon on a rail — hover for its name, click to go.

> These numbers assume every panel is collapsed. Open a tool and its 300–466px panel comes back, so the width goes back with it. That is spelled out under [Known limitations](#compatibility-and-known-limitations).

## Features

- **Left rail** — on the desktop shells, a 44px rail whether the sidebar is expanded or collapsed, listing every panel registered in the host (plugins, scheduled tasks, memory, …) and drawing each one with the icon its plugin registered
- **Right rail** — a 44px rail whether the right bar is expanded or collapsed, read live from the right bar's own guide ledger (files, context, Git, terminal, …)
- **Room that is really given up** — the rail never sits on top of a panel: the whole grid (sidebar column, conversation column, right bar column, and the right bar's own header and collapse button with it) steps 44px inwards, and the rail stands in the gap. The host's column widths, dragging and animation stay untouched, except for the right panel's width once its own resize handle is used
- **The left panel keeps the workspace only** — now that the rail carries the panel entries, the sidebar hides its own duplicate list (plugins, scheduled tasks, …), leaving the workspace tree and sessions
- **A footer strip** — the action row the sidebar used to pin to its bottom (DS Bot, memory, settings, account …), plus the 远程 launcher another plugin drops into it, moves into a strip pinned to the rail's own box: icons only, one 32px column, every tile on the rail's centre line, and the account portrait last
- **A wider or narrower right panel** — the panel's own drag handle only appears while it is not fullscreen, so the plugin draws one over the panel's left edge and writes both the panel's grid track and the panel box itself while dragging; the width is clamped to 300px … 60% of the window and remembered in `localStorage`; it is only ever written while the panel is open, so a closed panel reserves no track, and the stored width is re-applied the moment it opens
- **Two switches** — left and right can each be turned off, and that side goes back to stock DSH
- **Driven by the registry, not a hardcoded list** — install or remove any DSH plugin that registers a panel or a right-bar tool and the rails follow
- **Open, close again** — a right icon is a toggle: it opens its tool, and clicking the same icon again collapses the panel
- **Theme-aware** — host design tokens only, so light and dark just work
- **Keyboard reachable** — every entry carries a localized `aria-label` and a hover label, tab order is the rail order, Enter activates

## Screenshots

| # | What | File |
| --- | --- | --- |
| 1 | The 44px left rail with the sidebar collapsed | `docs/images/shot-left-rail.png` (pending) |
| 2 | The right rail next to an open tool panel | `docs/images/shot-right-rail.png` (pending) |
| 3 | The two switches on the settings page | `docs/images/shot-settings.png` (pending) |

All three are captured by the author in a real window — no mock-ups. Until they land, see the [layout overview](docs/images/layout.svg).

## Install

Requirements: DeepSeek Harness `0.2.1-rc.3` or newer, Node `>= 22.13`.

Every route ends with a DSH restart: plugins are mounted at start-up.

### Option A — let DSH do it (recommended)

Say this in a DSH conversation:

> Install this plugin for me: `dsh-activity-bar`, the repo is at `D:/Project/Honey/dsh插件开发/dsh-activity-bar`

It runs the command from Option B for you.

### Option B — one command (verified)

```bash
dsh plugin --profile desktop add "dsh-activity-bar@link:D:/Project/Honey/dsh插件开发/dsh-activity-bar"
```

`dsh` lives at `<DeepSeek Harness>/resources/runtime/cli/bin/dsh.cmd`. The command runs `pnpm add` inside the profile folder and does two things that matter: it writes the dependency, and it appends the package name to `dsh.profile.bundles`.

Why `bundles` matters: this plugin installs itself through **its own** `cordis.patch.yml`. The profile only has to acknowledge it as a bundle. Hand-writing another `- insert:` entry into the profile's yaml would mount it twice.

### Option C — edit the profile by hand

Your profile lives at `<DSH_HOME>/profiles/<profile>` (on Windows that is usually `C:\Users\<you>\.dsh\profiles\desktop`).

1. Add a dependency to that folder's `package.json`:

   ```json
   "dsh-activity-bar": "link:D:/Project/Honey/dsh插件开发/dsh-activity-bar"
   ```

2. Append one entry to the `dsh.profile.bundles` array in the same file:

   ```json
   "dsh-activity-bar"
   ```

3. Run `pnpm install` in that folder (this links the repo into `node_modules`), then restart DSH.

### Option D — from source

```bash
git clone <repo> dsh-activity-bar
cd dsh-activity-bar
```

Mount it through Option B or C. There is **no build step**: `lib/index.js` and `lib/client.js` are hand-written JS, so a page refresh picks up code edits (changing the mount itself needs a restart). With `dsh-client-hmr` installed you do not even need the refresh.

## Usage

### Left rail

| Action | Result |
| --- | --- |
| Click a panel icon (plugins / scheduled tasks / memory …) | The center switches to that panel; a collapsed sidebar expands first, the rail stays put |
| Click the icon that is already active | The panel stays open; the icon keeps its highlight bar |
| Click an icon in the lower third (DS Bot / memory / settings / account …) | Fires the action the host used to pin to the sidebar's bottom |
| Hover for 0.5s | The entry's name appears |

When the left rail is drawn:

- **Windows and macOS desktop**: always. The whole grid gives up 44px on its left edge and the rail stands there; expanded it is the panel entry, collapsed the column has zero width and the rail is the only way in.
- **Plain Web**: while the sidebar is expanded. Collapsed, DSH already leaves a ~56px icon track of its own, and the plugin deliberately does not draw a second one, so no entry appears twice.
- The decision reads what the host writes on `<html>`: `data-windows-titlebar` for Windows desktop, `data-platform="darwin"` for macOS desktop. Neither means a plain web page.

### Right rail

| Action | Result |
| --- | --- |
| Click a tool icon | The right bar expands and opens that tool |
| Click the same icon again | The right bar collapses and the rail stays put |
| While the right bar is open | The rail stays visible; the whole grid gives up 44px on its right edge, so the panel header and its collapse button shift left instead of hiding under the rail |
| No right-bar tool registered at all | No rail is drawn |

| Shortcut | Action |
| --- | --- |
| <kbd>Ctrl</kbd>+<kbd>`</kbd> | New terminal (host built-in) |
| <kbd>Ctrl</kbd>+<kbd>T</kbd> | Open the browser (host built-in) |

### Where the switches are

Settings → **Activity Bar**. Two rows, flip one and it takes effect immediately — no restart.

## Configuration

| Key | Type | Default | Meaning |
| --- | --- | --- | --- |
| `left` | boolean | `true` | Enable the left activity bar; off restores stock DSH on that side |
| `right` | boolean | `true` | Enable the right activity bar; off restores stock DSH on that side |

Both live in this browser's `localStorage` under `dsh-activity-bar.prefs`, as `{"left":true,"right":true}`. Why not the host config: DSH's settings service only serves allowlisted namespaces, so a third-party plugin cannot read its own config from the client half — and standing up a host HTTP route for two booleans is not worth it.

To ship "off by default", change the defaults in `readPrefs()` inside `lib/client.js`.

## Icon map

The rail draws the icon component each plugin registered for its panel; only when that component is missing, or fails inside the rail, does it fall back to a built-in glyph matched on the entry's id / kind, and finally to a dot.

| Side | Entry | Built-in icon | Notes |
| --- | --- | --- | --- |
| L | Plugins | puzzle | Plugin management |
| L | Scheduled tasks | clock | Automation list |
| L | Context insights | eye | Context usage |
| L | Memory / memories | brain | Memory entry |
| L | Any other panel | dot | `plugin*`, `schedul*`, `context*`, `memor*` hit the rows above |
| R | Files | folder | Workspace files |
| R | Context | layers | Context panel |
| R | New terminal | terminal | A standalone terminal |
| R | Git | branch | Repo status and commits |
| R | Browser | globe | In-app browser |
| R | Tasks | list | Queue and background jobs |
| R | Side chat | chat | Side conversation (beta) |
| R | Memory bank | notebook | Cross-session memory |

That list looks long, but all of it is read from the registry at runtime: install or remove a plugin and the rails follow, with no change here.

## Compatibility and known limitations

- Built against the real DOM and client APIs of DSH `0.2.1-rc.3`. Re-test after host upgrades if any of these change: the `shell.overlay` and `settings.section` slots, the `sidebar.panellist` slot, `layout.selectPanel / toggleSidebar / closeRightbar / panelInfo`, `sidebarRightTabs.guide()`, `sidebarRight.openTab / active / isExpanded`, and the `html[data-platform]` / `html[data-windows-titlebar]` attributes.
- Room is made with `padding` on the frame, and the only inline track the plugin ever writes is the right panel's third one, and only after the user drags the handle it draws; the left column and the `1fr` middle stay host-owned. The cost is "sidebar width 280, 226 of content", and settings still report 280. On the left the padding sits on the sidebar's inner box; on the right it sits on the whole right column, because the panel header and its collapse button are host-drawn and only a column-wide inset moves them out from under the rail. The earlier `margin` on the column pushed the sidebar shell's fixed 280px box out of its grid track and clipped its right end, which is why it went away.
- Panel icons render the component each plugin registered for the `sidebar.panellist` slot. If an icon component needs context this rail cannot give it, the error boundary on that one cell swaps in a built-in glyph and the rail keeps working.
- On plain Web, a collapsed sidebar gets no left rail (the host draws its own track): expand the sidebar to see it.
- On macOS desktop the rail respects `data-platform="darwin"` and `--dsh-frame-top-clearance` (48px), but no Mac has run it: on first use, check the rail does not cover the traffic lights.
- Opening a right-bar panel narrows the center with it; the width the rail saves only counts while panels are collapsed.
- The lower third is the host's own footer row moved into the rail: layout only, no logic rewritten. A long row scrolls inside that third, labels are hidden and names come from the hover label. Rows are recognised as the account by their own label text (`登录`, `account`, `profile`, `用户` …) and pushed last; a build that words it differently keeps the host's order.
- The sidebar's minimum width is the host's 264px, so the plugin cannot offer "narrower than 264 but still expanded".
- No new-session button on the rail: in the collapsed Windows state the host already pins one to the title bar at `left:48px`, and a second one would be a duplicate entry.
- No left-side "More" menu on the rail: it is a menu rather than a panel, and the host hides it with the rest of the column when collapsed.
- The plugin does not take over the workspace or session trees: expand the sidebar to see sessions.
- Not implemented: custom icon ordering, per-rail width, theme colors, drag-to-resize rails.
- Narrow viewports (<1024 auto-collapses the sidebar, <768 makes the right bar fullscreen) have not been checked case by case on a real machine.

## Uninstall

1. Drop the package from the profile: `dsh plugin --profile desktop remove dsh-activity-bar`; or delete its entry from both `dependencies` and `dsh.profile.bundles` in `package.json` by hand (removing only the dependency leaves the loader looking for a package that is gone).
2. Run `pnpm install` in the profile folder and restart DSH.
3. The plugin removes its attributes and CSS variables on unload. The `localStorage` key is harmless; delete `dsh-activity-bar.prefs` in devtools if you want it gone too.

## Development

```text
dsh-activity-bar/
├── package.json          # dsh.bundle.patch plus dsh.client.platform / inject
├── cordis.patch.yml      # the plugin's loader line
├── lib/
│   ├── index.js          # Host half: intentionally empty, all logic is client side
│   └── client.js         # Client half: both rails and the settings page
├── locale/
│   ├── en.json
│   └── zh.json
├── scripts/
│   └── smoke.mjs         # Offline self-test: fake DOM + fake React around the real client.js
├── docs/
│   ├── DESIGN.md
│   └── images/
├── README.md
└── README.zh-CN.md
```

- No build step. Edit the client half and refresh the page.
- Self-test: `node scripts/smoke.mjs`, which prints `smoke: all assertions passed` on success. It loads the real `lib/client.js` through `node:vm` and asserts style injection, both slot registrations, rail button order and `aria-label`s, click routing, the three marker attributes, preference persistence, the footer strip's pinned box and its auto-margin centring, a booted panel drag that rewrites both width channels and persists the result, and the open/closed gating that keeps a closed panel from reserving an empty track.
- Styling uses `--dsw-*` tokens only — no hardcoded colors, no reliance on DSH's hashed class names.
- Everything mounts into the existing `shell.overlay` slot: no nodes appended to `document.body`, no replacement of the app root.
- Apart from that one drag-written track, the layout never touches the host's `grid-template-columns`; room for the rails is `padding` on the frame, and the rail and the sidebar's footer strip are `position: fixed`, so the host's own drag handles keep working and stay under host control.

## Self-test checklist

Run before every release, by the author, nobody else:

- [x] A0 `node scripts/smoke.mjs` is green
- [ ] A1 1920 viewport, right bar collapsed, right rail only: center ≥ 1580
- [ ] A2 Same, both rails: center ≥ 1810
- [ ] A3 Turn the right switch off, reload: rail gone, right bar back to stock behavior
- [ ] A4 Turn the left switch off, reload: left side back to expanded by default
- [ ] A5 Every entry registered in the current environment is clickable, hover labels exist in both languages, tab order completes
- [ ] A6 Icon/background contrast ≥ 3:1 in both themes
- [ ] A7 20 open/close cycles with no console errors
- [ ] A8 Nothing left behind after uninstall — no nodes, no attributes
- [ ] A9 No dead buttons, no clipping, no double navigation at 1280×800 and 1024×700

## License

[MIT](./LICENSE)
