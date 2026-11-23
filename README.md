<div align="center">

<img src="docs/assets/icon.svg" width="96" alt="Peek logo" />

# Peek

**A Dynamic Island for Windows 11.**

A small island sits at the top of your screen. Pull it down for what's playing,<br />
live hardware stats and an AI search bar, then push it back up.

[![Latest release](https://img.shields.io/github/v/release/HighSkai/Peek?style=flat-square&label=release&color=111111&labelColor=3f3f3f)](https://github.com/HighSkai/Peek/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/HighSkai/Peek/total?style=flat-square&color=111111&labelColor=3f3f3f)](https://github.com/HighSkai/Peek/releases)
[![Build](https://img.shields.io/github/actions/workflow/status/HighSkai/Peek/ci.yml?branch=main&style=flat-square&label=build&color=111111&labelColor=3f3f3f)](https://github.com/HighSkai/Peek/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-111111?style=flat-square&labelColor=3f3f3f)](LICENSE)
[![Windows 10 and 11](https://img.shields.io/badge/Windows-10%20%7C%2011-111111?style=flat-square&labelColor=3f3f3f)](#requirements)

[**Download**](https://github.com/HighSkai/Peek/releases/latest) &nbsp;·&nbsp; [Features](#features) &nbsp;·&nbsp; [What's new](#whats-new-in-030) &nbsp;·&nbsp; [Getting started](#getting-started) &nbsp;·&nbsp; [AI setup](#ai-setup) &nbsp;·&nbsp; [Build from source](#building-from-source)

<br />

<img src="docs/assets/screenshots/home.png" alt="Peek's dashboard open at the top of the screen, showing the current song, the time, CPU, GPU, memory and temperature tiles, and a search bar" width="82%" />

</div>

## What's new in 0.3.0

- Peek updates itself. It checks GitHub, shows the release notes and installs new versions in place, with no installer to download. Automatic installs are optional. See [Updates](#updates).
- A new layout: the island only takes the height each section needs, and Home is three short rows (now playing next to the clock, live stats, search) instead of a large music card.
- Tabs show their names, and the close handle is the full width of the island.
- Animations follow Windows by default, with Full, Reduced and Off to choose from. Springs are calmer, and numbers roll smoothly between values.
- Peek's eyes can be turned off in one click.

0.2.0 made everything smaller, added compact density, hotkey mode, settings inside the island, drag-to-open and drag-to-close, real eyes and the Windows 11 fonts. See the [changelog](CHANGELOG.md) for both releases.

## Features

### The island

Two looks: *Dynamic Island* floats as a pill just below the top edge, and *Notch* grows out of the screen edge with curved shoulders. When nothing is going on the island shows Peek's eyes, a clock, live stats or nothing at all (Settings → Appearance → *Resting island*). While music plays it shows the album art and a visualizer, with a short banner when the track changes.

<div align="center">
<img src="docs/assets/screenshots/states.png" alt="Six island states: resting with Peek's eyes, now playing, a new track banner, notch mode, a clock and live stats" width="100%" />
</div>

Everything outside the island is click-through. It hides during fullscreen games and videos, and it gives focus back to the app you were using when it closes.

### Drag it open, push it closed

Pull the island down and the dashboard opens under the pointer. Push the open dashboard up by its header or the handle along the bottom (the whole width of the island) and it shrinks back. Let go and Peek uses the pointer's speed: a quick flick finishes the motion, a slow drag that hasn't gone far springs back. Pulling past fully open stretches it a little, like a rubber band. You can also click the island, scroll down on it, or press the shortcut; tap the handle or press <kbd>Esc</kbd> to close.

The open island is only as tall as the section you're on. Home is a short strip of three rows; System, Ask and Settings grow taller, and the island springs between them.

<div align="center">
<img src="docs/assets/screenshots/gestures.png" alt="Three frames: the resting island stretching as it's pulled down with the eyes looking down, the dashboard opening under the pointer, and the dashboard shrinking as it's pushed back up" width="100%" />
</div>

### Regular or compact

Pick a density in Settings → Appearance. Compact is the same layout drawn about 14% smaller, with crisp text (it uses CSS zoom, not a scaled bitmap). Island and dashboard sizes (small, medium, large) still apply on top.

<div align="center">
<img src="docs/assets/screenshots/density.png" alt="The dashboard at regular density next to the same dashboard at compact density, which is visibly smaller" width="100%" />
</div>

### Hotkey mode

Set *Show the island* to *On shortcut* in Settings → General (or tick *Show only on shortcut* in the tray menu). The island then stays tucked above the top edge of the screen. Press the shortcut, <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>Space</kbd> by default, and it slides down and opens; close it and it slides away again. It also opens over fullscreen apps.

### Animations

Settings → Motion → *Animations* has four levels. *System* (the default) follows Windows: Settings → Accessibility → Visual effects → Animation effects. *Full* uses springs modeled on Apple's presets, with a little bounce when the island opens and none when it closes. *Reduced* replaces movement with short fades, and *Off* makes every change instant. Live numbers roll from one value to the next at the full level.

### Updates

Settings → Updates shows whether a newer version is out, with its release notes. **Install and restart** downloads the installer from this repository's latest release, checks its size and SHA-256 against what GitHub publishes for it, runs it silently and starts Peek again. Peek checks when it starts and every 6 hours (you can turn that off), and *Install updates automatically* does the whole thing while the island is closed. *Check for updates…* is also in the tray menu, and the settings gear shows a dot when an update is ready.

<div align="center">
<img src="docs/assets/screenshots/updates.png" alt="The Updates page inside the island: Peek 0.3.1 is available with an Install and restart button, the last check time, and switches to check and install automatically" width="70%" />
</div>

### Now playing

Works with anything that reports media to Windows: Spotify, Chrome, Edge, Firefox, Media Player, Apple Music, TIDAL, VLC and more. Album art, a seek bar, play and pause, next, previous, shuffle, repeat and system volume.

### Hardware monitor

| | Source | Needs anything extra? |
| --- | --- | --- |
| CPU usage, per-thread load, clock | Windows / `sysinfo` | No |
| GPU usage and video memory (NVIDIA, AMD, Intel) | Windows performance counters + DXGI | No |
| NVIDIA temperature, fan, power, clock | NVML (ships with the NVIDIA driver) | No |
| Memory, page file, disks, network, battery, uptime | Windows / `sysinfo` | No |
| CPU and motherboard temperatures, fan RPM, AMD/Intel GPU sensors | [LibreHardwareMonitor](https://github.com/LibreHardwareMonitor/LibreHardwareMonitor) or OpenHardwareMonitor | Keep it running in the background |

Windows doesn't give regular apps CPU temperatures or fan speeds, so Peek reads them from LibreHardwareMonitor when it's running. Sampling only happens while the dashboard is open or live stats are showing.

### AI search bar

Ask a question and the answer streams in, formatted with Markdown. Press <kbd>Ctrl</kbd>+<kbd>Enter</kbd> to search the web in your browser instead. Peek works with local models ([Ollama](https://ollama.com), [LM Studio](https://lmstudio.ai) or any OpenAI-compatible server such as llama.cpp, Jan, LocalAI or vLLM) and with OpenAI, Anthropic, Google Gemini, OpenRouter and Groq. It can search first with [SearXNG](https://docs.searxng.org), Brave Search or Tavily so answers cite numbered sources. API keys are stored in Windows Credential Manager, never in a settings file.

<table>
  <tr>
    <td width="33%"><img src="docs/assets/screenshots/media.png" alt="Now playing tab with large album art, seek bar, playback controls and volume" /></td>
    <td width="33%"><img src="docs/assets/screenshots/system.png" alt="System tab with processor usage history, per-thread load and graphics card details" /></td>
    <td width="33%"><img src="docs/assets/screenshots/ask.png" alt="Ask tab showing a streamed answer from a local model" /></td>
  </tr>
  <tr>
    <td align="center"><sub>Now playing</sub></td>
    <td align="center"><sub>System</sub></td>
    <td align="center"><sub>Ask</sub></td>
  </tr>
</table>

### Settings, inside the island

The gear in the dashboard opens settings in place, laid out like the Windows 11 Settings app. It covers the resting island (eyes, clock, stats or off), appearance, density and size, position and monitor, animations, startup, hotkey mode and the shortcut, every feature toggle, AI providers and updates. Turn off anything you don't use and it stops running in the background. *Settings…* in the tray menu opens the same page.

<table>
  <tr>
    <td width="50%"><img src="docs/assets/screenshots/settings.png" alt="Settings inside the island, Appearance page, with the resting island set to Eyes, Clock, Stats or Off, and the Dynamic Island and Notch styles" /></td>
    <td width="50%"><img src="docs/assets/screenshots/hotkey.png" alt="Settings inside the island, General page, with Show the island set to On shortcut and the Alt+Shift+Space shortcut" /></td>
  </tr>
  <tr>
    <td align="center"><sub>Resting island, style and density</sub></td>
    <td align="center"><sub>Hotkey mode and the shortcut</sub></td>
  </tr>
</table>

<sub>Screenshots use sample data.</sub>

## Getting started

### Requirements

- Windows 10 (version 1903 or later) or Windows 11. Peek is designed for Windows 11.
- Microsoft Edge WebView2 Runtime. It's built into Windows 11; the installer downloads it if needed.

### Install

1. Download **`Peek_x.y.z_x64-setup.exe`** from the [latest release](https://github.com/HighSkai/Peek/releases/latest). An `.msi` is there too.
2. Run it. No admin rights are needed.
3. If SmartScreen warns that the app is unrecognized (the installer isn't code-signed yet), choose **More info → Run anyway**.

Peek appears at the top of your screen and adds an icon to the system tray. Right-click the tray icon for the menu, or open settings from the gear in the dashboard.

### Controls

| Do this | To |
| --- | --- |
| Click the island, pull it down, or scroll down on it | Open the dashboard |
| <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>Space</kbd> (changeable) | Open or close the dashboard with the search bar focused |
| Push the header or the bottom handle up, or tap the handle | Close the dashboard |
| <kbd>Esc</kbd> or click elsewhere | Close the dashboard |
| <kbd>Ctrl</kbd>+<kbd>1</kbd> to <kbd>4</kbd> | Switch between Home, Music, System and Ask |
| <kbd>Enter</kbd> in the search bar | Ask the AI (or search the web, if you swap them in settings) |
| <kbd>Ctrl</kbd>+<kbd>Enter</kbd> | Do the other one |
| Pin button in the dashboard | Keep it open while you work in other windows |
| Left-click the tray icon | Open or close the dashboard |

## AI setup

Open Settings → AI and search, pick a provider and press **Load models** to check the connection.

| Provider | Endpoint (default) | Key |
| --- | --- | --- |
| Ollama | `http://127.0.0.1:11434` | Not needed. Run `ollama pull llama3.2` first. |
| LM Studio | `http://127.0.0.1:1234/v1` | Not needed. Start the local server in LM Studio. |
| Custom (OpenAI-compatible) | `http://127.0.0.1:8080/v1` | Optional |
| OpenAI | `https://api.openai.com/v1` | Required |
| Anthropic | `https://api.anthropic.com/v1` | Required |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta` | Required |
| OpenRouter | `https://openrouter.ai/api/v1` | Required |
| Groq | `https://api.groq.com/openai/v1` | Required |

Every endpoint can be changed, so self-hosted and proxy setups work too. For web answers, choose SearXNG (your instance must allow JSON output), Brave Search or Tavily under *Web answers*, then switch on **Web** in the Ask tab.

*Plain answers* is on by default. It adds a short style guide to the system prompt so replies lead with the answer and skip filler like "Great question!", closing offers, em dashes and inflated words. The rules are condensed from [blader/humanizer](https://github.com/blader/humanizer), which is based on Wikipedia's [Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing). Turn it off in Settings → AI and search if you prefer your own instructions.

## Privacy

Peek has no accounts, analytics or telemetry. It only talks to the network when you ask it to:

- the AI and search providers you configure, with the questions you send them;
- your browser's search engine when you search the web;
- GitHub, to check for and download updates (at startup and every 6 hours unless you turn it off in Settings → Updates).

Settings are saved in `%APPDATA%\io.github.highskai.peek`. API keys are saved in Windows Credential Manager under **Peek**. Local models keep everything on your PC.

## Design notes

Peek aims to look like part of Windows rather than a web page.

- Type is Segoe UI Variable, the Windows 11 UI font, in its three optical sizes: Small for captions, Text for body copy and Display for big numbers like the clock. Code uses Cascadia Mono.
- Labels and headings are in sentence case. There are two corner radii (cards and controls) and one shadow (album art).
- The layout follows Apple's guidance for the expanded Dynamic Island ([Live Activities](https://developer.apple.com/design/human-interface-guidelines/live-activities)): use only the space you need, change height with the content, and keep margins concentric with the outer corners. Open-notch apps on the Mac such as [boring.notch](https://github.com/TheBoredTeam/boring.notch), [Atoll](https://github.com/FI-153/Atoll) and [NotchNook](https://lo.cafe/notchnook) informed the wide, short Home row with media beside the time.
- The pull-down gesture is direct manipulation: the island's size is driven by the pointer, then handed to a spring with the pointer's velocity. Content fades and scales with how far open the island is, so it never pops in.
- Springs use the duration and bounce model from Apple's [Animate with springs](https://developer.apple.com/videos/play/wwdc2023/10158/) talk: 15% bounce when opening, none when closing. [Motion](https://motion.dev) runs them, and [NumberFlow](https://number-flow.barvian.me) rolls the numbers.
- A pass with the [zero-slop / no-slop](https://github.com/eid0lon/zero-slop) pattern catalog removed common tells of generated interfaces: uppercase tracked micro-labels, cards nested in cards, glow and shimmer effects, generic sparkle icons, suggested-prompt chips and em dashes in copy.

## Building from source

You need [Node.js](https://nodejs.org) 20+, [Rust](https://rustup.rs) (stable, MSVC) and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for Windows.

```powershell
git clone https://github.com/HighSkai/Peek.git
cd Peek
npm install
npm run tauri dev      # run with hot reload
npm run tauri build    # installers land in src-tauri/target/release/bundle
```

`npm run dev` on its own serves the UI in a browser with a demo backend, which is handy for design work. See [CONTRIBUTING.md](CONTRIBUTING.md) for the query parameters it understands.

### Project structure

```
Peek/
├─ src/                     React + TypeScript UI
│  ├─ island/               the island, the gestures, the dashboard and its tabs
│  ├─ settings/             settings pages shown inside the island
│  ├─ components/           Peek's eyes and mascot, shadcn/ui components
│  └─ lib/                  IPC, stores, layout sizes, types, demo backend
├─ src-tauri/               Rust backend (Tauri 2)
│  └─ src/
│     ├─ island.rs          placement, click-through, fullscreen detection, focus
│     ├─ media.rs           Windows media session (GSMTC) integration
│     ├─ audio.rs           output level meter and master volume
│     ├─ hardware/          sysinfo, GPU counters, NVML, LibreHardwareMonitor
│     ├─ ai.rs              streaming chat, model lists, web grounding, plain answers
│     ├─ settings.rs        persisted settings
│     ├─ secrets.rs         Windows Credential Manager
│     ├─ updates.rs         check GitHub releases, download, verify and install updates
│     └─ tray.rs            tray icon and menu
└─ docs/assets/             logo and screenshots
```

### Built with

[Tauri 2](https://tauri.app) · [React](https://react.dev) · [shadcn/ui](https://ui.shadcn.com) · [Radix UI](https://www.radix-ui.com) · [Tailwind CSS](https://tailwindcss.com) · [Motion](https://motion.dev) · [NumberFlow](https://number-flow.barvian.me) · [Lucide](https://lucide.dev) · [sysinfo](https://github.com/GuillaumeGomez/sysinfo) · [windows-rs](https://github.com/microsoft/windows-rs) · [nvml-wrapper](https://github.com/rust-nvml/nvml-wrapper)

Design and writing checks: [zero-slop](https://github.com/eid0lon/zero-slop) · [humanizer](https://github.com/blader/humanizer)

## Contributing

Issues and pull requests are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) first.

## License

[MIT](LICENSE)

<sub>Inspired by the Dynamic Island on iPhone. Apple, iPhone and Dynamic Island are trademarks of Apple Inc.; Peek is an independent project and is not affiliated with Apple.</sub>
