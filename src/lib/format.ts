const UNITS = ["B", "KB", "MB", "GB", "TB"]

/** Shown when a reading isn't available. */
export const NONE = "--"

export function bytes(n: number | null | undefined, digits = 1): string {
  if (n == null || !isFinite(n)) return NONE
  let i = 0
  let v = n
  while (v >= 1024 && i < UNITS.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(i === 0 ? 0 : v < 10 ? digits : 0)} ${UNITS[i]}`
}

export function rate(bps: number | null | undefined): string {
  if (bps == null || !isFinite(bps)) return NONE
  return `${bytes(bps)}/s`
}

export function pct(n: number | null | undefined, digits = 0): string {
  if (n == null || !isFinite(n)) return NONE
  return `${n.toFixed(digits)}%`
}

export function temp(c: number | null | undefined, unit: "c" | "f" = "c"): string {
  if (c == null || !isFinite(c)) return NONE
  return unit === "f" ? `${Math.round((c * 9) / 5 + 32)}°F` : `${Math.round(c)}°C`
}

export function duration(ms: number): string {
  if (!isFinite(ms) || ms < 0) ms = 0
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, "0")
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`
}

export function uptime(secs: number): string {
  const d = Math.floor(secs / 86400)
  const h = Math.floor((secs % 86400) / 3600)
  const m = Math.floor((secs % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export function ghz(mhz: number | null | undefined): string {
  if (!mhz) return NONE
  return `${(mhz / 1000).toFixed(2)} GHz`
}

export function clock(date: Date, h24: boolean) {
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: !h24 })
  const match = time.match(/^(.*?)(\s?[AaPp]\.?[Mm]\.?)$/)
  return match ? { time: match[1], suffix: match[2].trim() } : { time, suffix: "" }
}

export function longDate(date: Date) {
  return date.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })
}

export function localTimeString() {
  return new Date().toLocaleString([], { dateStyle: "full", timeStyle: "short" })
}

export function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}
