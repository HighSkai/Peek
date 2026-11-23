# Changelog

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
