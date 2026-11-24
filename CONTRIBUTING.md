# Contributing to Peek

Thanks for helping out! Bug reports, ideas and pull requests are all welcome.

## Development setup

You need Windows 10 or 11 with:

- [Node.js](https://nodejs.org) 20 or newer
- [Rust](https://rustup.rs) (stable, MSVC toolchain)
- The [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) (Microsoft C++ Build Tools and WebView2)

```powershell
git clone https://github.com/HighSkai/Peek.git
cd Peek
npm install
npm run tauri dev
```

### Working on the UI in a browser

`npm run dev` serves the interface at http://localhost:1420 with a built-in demo backend
(sample media, hardware stats and a fake assistant), so you can iterate on the UI without
building the native app. Useful query parameters:

| Parameter | Effect |
| --- | --- |
| `?expanded=1&tab=home` | Open the dashboard on a tab (`home`, `media`, `system`, `ask`, `settings`) |
| `&page=appearance` | Settings page (`general`, `appearance`, `position`, `motion`, `features`, `ai`, `updates`, `about`) |
| `&mode=notch` / `&style=glass` | Try other appearances |
| `&density=compact` | Compact density |
| `&reveal=hotkey` | Hotkey mode: the island stays hidden until opened |
| `&idle=clock` | What the resting island shows (`eyes`, `clock`, `stats`, `none`) |
| `&prompt=Hello` | Send a question to the demo assistant |
| `&media=0` / `&playing=0` | Nothing playing / paused |
| `&banner=1` | Announce a new track shortly after loading |
| `&tucked=1` | Tuck away as if a window were under the island, then come back |
| `&update=1` | Pretend a newer release is out (Settings → Updates, with a fake download) |
| `&motion=full` | Animation level: `system`, `full`, `reduced` or `off` |

The browser pane in some editors pauses `requestAnimationFrame` while hidden, which also
pauses the animations. Use a visible window when checking motion.

## Before opening a pull request

```powershell
npm run typecheck
cd src-tauri
cargo fmt
cargo clippy
```

- Keep the palette black, gray and white.
- Use the Windows type: Segoe UI Variable (`font-sans`, `font-small` for 11px and under,
  `font-display` for large numbers) and the two radius tokens (`rounded-card`, `rounded-ctl`).
- Keep labels and headings in sentence case, and skip decoration that doesn't do a job
  (glows, shimmer, gradient text, cards inside cards). The
  [no-slop pattern catalog](https://github.com/eid0lon/zero-slop) is a good checklist.
- New settings need a default in `src-tauri/src/settings.rs`, a type in `src/lib/types.ts`
  and a control in `src/settings/`.
- Never log or persist API keys; they belong in Windows Credential Manager via `secrets.rs`.

## Releasing

Bump the version in `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`,
`src-tauri/Cargo.lock` and `src-tauri/tauri.conf.json`, add a section to `CHANGELOG.md`,
then push a tag such as `v0.3.0`. The release workflow builds the installers and publishes
them on the Releases page with that changelog section as the notes.

Installed copies of Peek (0.3.0 and later) pick the release up through Settings → Updates.
They download the asset ending in `_x64-setup.exe`, so keep that name, and they check it
against the SHA-256 digest GitHub publishes for release assets.
