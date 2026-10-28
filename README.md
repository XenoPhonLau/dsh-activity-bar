# dsh-activity-bar

<p align="center">
  <a href="./LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-3b82f6?style=flat-square"></a>
  <img alt="DSH" src="https://img.shields.io/badge/DeepSeek%20Harness-0.2.1--rc.3%2B-6366f1?style=flat-square">
  <img alt="Platform" src="https://img.shields.io/badge/platform-Windows%20%C2%B7%20macOS%20desktop%20%C2%B7%20Web-0f172a?style=flat-square">
</p>

<p align="center">
  Turn the space freed by DSH's collapsed side panels into narrow icon rails, VS Code style — and give the width back to your workspace.<br>
  <sub><a href="./README.zh-CN.md">中文</a> · English</sub>
</p>

![Activity bar overview](docs/images/1.png)

## What it does

DSH keeps its left sidebar and right bar open by default; together they eat close to 40% of the window width. With this plugin installed:

- **Two 44px rails** — one on each side, always there. Entries come from the host registry, so the rails grow and shrink with the plugins you install
- **Room that is really given up** — a rail never sits on top of a panel: the whole grid steps 44px inwards, so column widths, dragging and animation stay the host's own
- **Nothing disappears** — the action row the sidebar used to pin to its bottom (DS Bot, memory, settings, account, plus the 远程 launcher other plugins drop in) becomes a strip along the bottom of the rail: icons only, each one centred
- **A drag-resizable right panel** — grab the handle on the panel's left edge; the width is clamped to 300px … 60% of the window and remembered across restarts
- **Either side can be switched off** — Settings → **Activity Bar**, two switches, effective immediately; an off side goes back to stock DSH

## Requirements

DeepSeek Harness `0.2.1-rc.3` or newer (Node `>= 22.13`).

## Install

From git, one command:

```bash
dsh plugin --profile desktop add "dsh-activity-bar@git+https://github.com/XenoPhonLau/dsh-activity-bar.git"
```

`dsh` lives at `<DeepSeek Harness>/resources/runtime/cli/bin/dsh.cmd`; point `--profile` at the profile you want it in. The command writes the dependency into that profile and registers the package in `dsh.profile.bundles` for you.

Then **restart DSH** — plugins are mounted at start-up.

To pick up a newer commit, run:

```bash
dsh plugin --profile desktop update dsh-activity-bar
```
