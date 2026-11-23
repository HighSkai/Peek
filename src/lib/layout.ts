import type { Density, SizePreset } from "./types"

/**
 * Dashboard layout size in CSS pixels at regular density. Mirrors `dashboard_size` in
 * island.rs. Compact density draws the same layout scaled by `DENSITY_SCALE`.
 */
export const DASHBOARD: Record<SizePreset, { w: number; h: number }> = {
  small: { w: 540, h: 320 },
  medium: { w: 600, h: 356 },
  large: { w: 680, h: 404 },
}

/** Resting island size at regular density. */
export const COMPACT: Record<SizePreset, { w: number; h: number }> = {
  small: { w: 128, h: 28 },
  medium: { w: 150, h: 31 },
  large: { w: 172, h: 34 },
}

/** How much smaller everything is drawn in compact density. Mirrors island.rs. */
export const DENSITY_SCALE: Record<Density, number> = {
  regular: 1,
  compact: 0.86,
}

/** Extra width when a live activity (now playing) is shown in the resting island. */
export const ACTIVITY_EXTRA = 104

/** Extra width for live stats in the resting island. */
export const STATS_EXTRA = 56

/** Temporary banner shown when the track changes. */
export const BANNER = { w: 330, h: 62 }

/** Room for the shadow around the dashboard; matches SIDE_MARGIN in island.rs. */
export const SIDE_MARGIN = 48

/** Corner radius of the open dashboard at regular density. */
export const DASHBOARD_RADIUS = { island: 26, notch: 22 }

export function scaled(size: { w: number; h: number }, scale: number) {
  return { w: Math.round(size.w * scale), h: Math.round(size.h * scale) }
}
