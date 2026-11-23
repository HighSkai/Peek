import type { Density, Settings, SizePreset, Tab } from "./types"

// Sizes are CSS pixels at regular density; compact density draws the same layout
// scaled by DENSITY_SCALE. The open island takes only the height its section needs and
// springs between sections. island.rs mirrors the widths and the tallest height.

export const DASHBOARD_WIDTH: Record<SizePreset, number> = { small: 540, medium: 600, large: 680 }

const HEIGHT_SCALE: Record<SizePreset, number> = { small: 0.92, medium: 1, large: 1.12 }

/** Heights of the taller sections at the medium size. */
const SECTION_HEIGHT: Record<Exclude<Tab, "home">, number> = {
  media: 272,
  system: 384,
  ask: 376,
  settings: 404,
}

/** Header with the section tabs. */
export const HEADER_H = 40
/** The handle along the bottom edge: tap it or push it up to close. */
export const HANDLE_H = 22

/** Home rows: now playing (or the clock), live stats, search. */
export const HOME_ROWS = { top: 84, stats: 62, search: 36, gap: 8 }

function homeHeight(s: Settings) {
  let h = HOME_ROWS.top + HOME_ROWS.gap + HOME_ROWS.search
  if (s.featureHardware) h += HOME_ROWS.stats + HOME_ROWS.gap
  return HEADER_H + 2 + h + HANDLE_H + 2
}

/** Layout size of the open island for a section. */
export function dashboardSize(s: Settings, tab: Tab) {
  const w = DASHBOARD_WIDTH[s.dashboardSize]
  if (tab === "home") return { w, h: homeHeight(s) }
  return { w, h: Math.round(SECTION_HEIGHT[tab] * HEIGHT_SCALE[s.dashboardSize]) }
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

/** Corner radius of the open island at regular density. */
export const DASHBOARD_RADIUS = { island: 26, notch: 22 }

export function scaled(size: { w: number; h: number }, scale: number) {
  return { w: Math.round(size.w * scale), h: Math.round(size.h * scale) }
}
