# Changelog

## 0.3.1 (2026-11-23)

### Out of the way

- The island no longer covers what's under it. When a window sits under the resting island (a maximized browser's tabs, an app's title bar), it slides up above the screen and lets every click through. Rest the pointer on the top edge of the screen in front of it for a moment and it comes back; move away and it tucks again.
- Opening it with the shortcut or the tray works as before, and closing the dashboard tucks it away again.
- New *Move aside for windows* switch in Settings → General → Behavior. It's on by default.

### Also

- Fullscreen games and videos hide the island sooner: Peek checks every 250 ms instead of every 750 ms.
- New README screenshots, including the island moving aside over a browser.

## 0.3.0 (2026-11-23)

### Updates without reinstalling

- New Updates page in settings. Peek checks GitHub when it starts and every 6 hours, shows the release notes and installs a new version in place: it downloads the installer, checks its size and SHA-256 against the release, runs it silently and restarts. No installer window, no download folder.
- *Install updates automatically* does all of that on its own while the island is closed. It's off by default.
- *Check for updates…* in the tray menu, and a dot on the settings gear when an update is ready.
- Updating from 0.2.0 still needs this one installer; later versions update themselves.

### Layout

- The open island only takes the height its section needs and springs between sections, following Apple's guidance for the expanded Dynamic Island. Home is 264 px tall (was 356), Music 272, System and Ask about 380, Settings 404.
- Home is three short rows: a compact now-playing strip (62 px art, title, artist, progress and controls) beside the clock, four live-stat tiles, then search. The large music card is gone.
- Section tabs show their names (Home, Music, System, Ask), not just icons. Ctrl+1 to Ctrl+4 switch between them.
- 12 px margins all round, concentric with the island's corners.

### Closing

- The handle along the bottom is now the full width of the island and 22 px tall instead of a thin strip. It stays attached to the bottom edge while you drag, grows when you point at it, and shows a grab cursor. Tap it or push it up to close.

### Animations

- New *Animations* setting: System (default), Full, Reduced or Off. System follows Windows' Animation effects setting (Accessibility > Visual effects).
- Full uses Apple's spring presets: a short "snappy" spring with a little bounce when opening (15%, was 28%) and a "smooth" spring with none when closing.
- Reduced swaps movement for short fades and quick size changes with no overshoot. Off makes everything instant.
- Numbers (stats, clock) roll smoothly from one value to the next with [NumberFlow](https://number-flow.barvian.me).

### Eyes

- Appearance now opens with *Resting island: Eyes, Clock, Stats or Off*, so the eyes can be turned off in one click for both the island and the notch.

## 0.2.0 (2026-11-23)

### Smaller, and your choice of how small

- The dashboard is 600 × 356 at the default size (was 700 × 430) and the resting island 150 × 31 (was 182 × 34). Spacing, controls and type were tightened to match.
- New *Density* setting: Compact draws the island and dashboard about 14% smaller again, with sharp text.

### Hotkey mode

- New *Show the island: On shortcut* setting (also in the tray menu as *Show only on shortcut*). The island stays above the top edge of the screen until you press the shortcut, then slides down and opens.
- The shortcut now opens the dashboard on your default tab, and opens it over fullscreen apps right away.
- The shortcut is paused while you record a new one, so pressing the old combination no longer closes the island.

### Settings inside the island

- Settings open in the dashboard instead of a separate window, with a navigation rail like the Windows 11 Settings app. *Settings…* in the tray and a second launch of Peek open the same page.
- Menus stay inside the island, so every option can be clicked.

### Drag, springs and motion

- Pull the island down and the dashboard opens under the pointer; push the header or the bottom handle up and it shrinks back. Previously the island grew a little and then jumped open, and closing had no drag at all.
- Letting go hands the pointer's speed to the spring: a quick flick finishes the motion, a slow short drag springs back. Pulling past open stretches like a rubber band.
- Content fades and scales with how far open the island is instead of on a timer, and the blur-based fades are gone, which keeps animations smooth on large dashboards.
- The window's click area is updated at the start and end of each animation instead of every frame.

### Peek's eyes

- The resting island shows real eyes (white ovals with pupils, as in the logo) instead of two white pills. They blink, glance around, follow the pointer while it's over the island and look down while you pull.

### Type and cleanup

- All text uses Segoe UI Variable in its Small, Text and Display optical sizes. Large numbers use Display Semibold, like the Windows clock.
- Removed common tells of generated UI, using the [zero-slop](https://github.com/eid0lon/zero-slop) catalog: uppercase tracked labels, a card around the cards, glow and shimmer effects, sparkle icons for AI, suggested-prompt chips and em dashes in copy. Two corner radii and one shadow are used throughout.
- New *Plain answers* setting (on by default) asks the model to skip chatbot filler, based on [humanizer](https://github.com/blader/humanizer).

### Removed

- The separate settings window and its Mica and theme options.

## 0.1.0 (2026-11-21)

First release.
