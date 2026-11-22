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
| `?window=settings` | Show the settings window |
| `&expanded=1&tab=home` | Open the dashboard on a tab (`home`, `media`, `system`, `ask`) |
| `&mode=notch` / `&style=glass` | Try other appearances |
| `&prompt=Hello` | Send a question to the demo assistant |
| `&media=0` | Nothing playing |

## Before opening a pull request

```powershell
npm run typecheck
cd src-tauri
cargo fmt
cargo clippy
```

- Keep the palette black, gray and white.
- New settings need a default in `src-tauri/src/settings.rs`, a type in `src/lib/types.ts`
  and a control in the settings window.
- Never log or persist API keys; they belong in Windows Credential Manager via `secrets.rs`.

## Releasing

Bump the version in `package.json`, `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json`,
then push a tag such as `v0.2.0`. The release workflow builds the installers and publishes
them on the Releases page.
