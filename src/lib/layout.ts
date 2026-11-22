import type { SizePreset } from "./types"

/** Expanded dashboard size in CSS pixels. Mirrors `dashboard_size` in island.rs. */
export const DASHBOARD: Record<SizePreset, { w: number; h: number }> = {
  small: { w: 620, h: 380 },
  medium: { w: 700, h: 430 },
  large: { w: 800, h: 500 },
}

/** Resting island size. */
export const COMPACT: Record<SizePreset, { w: number; h: number }> = {
  small: { w: 150, h: 30 },
  medium: { w: 182, h: 34 },
  large: { w: 214, h: 38 },
}

/** Extra width when a live activity (now playing) is shown in the compact island. */
export const ACTIVITY_EXTRA = 128

/** Temporary banner shown when the track changes. */
export const BANNER = { w: 372, h: 76 }

/** Room for the shadow around the dashboard; matches SIDE_MARGIN in island.rs. */
export const SIDE_MARGIN = 48
