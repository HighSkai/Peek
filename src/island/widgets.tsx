import { useEffect, useId, useMemo, useRef, useState } from "react"
import { motion } from "motion/react"
import { cn } from "@/lib/utils"
import { useAudioLevel } from "@/lib/store"

/** Smooth area sparkline. Values are plotted against `max` (auto when omitted). */
export function Sparkline({
  values,
  max,
  className,
  strokeOpacity = 0.9,
  fillOpacity = 0.14,
}: {
  values: number[]
  max?: number
  className?: string
  strokeOpacity?: number
  fillOpacity?: number
}) {
  const id = useId()
  const { line, area } = useMemo(() => {
    const n = 60
    const pts = values.slice(-n)
    if (pts.length < 2) return { line: "", area: "" }
    const top = max ?? Math.max(1, ...pts) * 1.15
    const w = 100
    const h = 30
    const step = w / (n - 1)
    const offset = (n - pts.length) * step
    const xy = pts.map((v, i) => [offset + i * step, h - (Math.min(v, top) / top) * (h - 2) - 1] as const)
    let d = `M${xy[0][0]},${xy[0][1]}`
    for (let i = 1; i < xy.length; i++) {
      const [x0, y0] = xy[i - 1]
      const [x1, y1] = xy[i]
      const cx = (x0 + x1) / 2
      d += ` C${cx},${y0} ${cx},${y1} ${x1},${y1}`
    }
    return { line: d, area: `${d} L${xy[xy.length - 1][0]},${h} L${xy[0][0]},${h} Z` }
  }, [values, max])

  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className={cn("h-8 w-full", className)} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="white" stopOpacity={fillOpacity} />
          <stop offset="1" stopColor="white" stopOpacity={0} />
        </linearGradient>
      </defs>
      {area && <path d={area} fill={`url(#${id})`} />}
      {line && (
        <path
          d={line}
          fill="none"
          stroke="white"
          strokeOpacity={strokeOpacity}
          strokeWidth={1.4}
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
        />
      )}
    </svg>
  )
}

/** Horizontal usage bar. */
export function Meter({ value, className }: { value: number | null | undefined; className?: string }) {
  const v = Math.max(0, Math.min(100, value ?? 0))
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-white/10", className)}>
      <motion.div
        className="h-full rounded-full bg-white"
        initial={false}
        animate={{ width: `${v}%`, opacity: 0.55 + (v / 100) * 0.45 }}
        transition={{ type: "spring", stiffness: 140, damping: 22 }}
      />
    </div>
  )
}

/** Circular gauge. */
export function Ring({ value, size = 36, stroke = 3.5 }: { value: number | null | undefined; size?: number; stroke?: number }) {
  const v = Math.max(0, Math.min(100, value ?? 0))
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} stroke="white" strokeOpacity={0.12} strokeWidth={stroke} fill="none" />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke="white"
        strokeWidth={stroke}
        strokeLinecap="round"
        fill="none"
        strokeDasharray={c}
        initial={false}
        animate={{ strokeDashoffset: c * (1 - v / 100) }}
        transition={{ type: "spring", stiffness: 120, damping: 20 }}
      />
    </svg>
  )
}

/**
 * Music bars. In "audio" mode they react to the system output level; in "animated"
 * mode they move on their own; when paused they rest.
 */
export function Visualizer({
  playing,
  mode,
  bars = 5,
  height = 14,
  barWidth = 3,
  gap = 2,
}: {
  playing: boolean
  mode: "audio" | "animated" | "off"
  bars?: number
  height?: number
  barWidth?: number
  gap?: number
}) {
  const level = useAudioLevel((s) => s.level)
  const seeds = useRef(Array.from({ length: bars }, (_, i) => 0.55 + 0.45 * Math.sin(i * 1.7 + 0.6)))
  const [tick, setTick] = useState(0)

  // Animated mode (and a gentle shimmer on top of audio mode).
  useEffect(() => {
    if (!playing || mode === "off") return
    const id = window.setInterval(() => setTick((t) => t + 1), mode === "audio" ? 120 : 160)
    return () => window.clearInterval(id)
  }, [playing, mode])

  if (mode === "off") return null

  const heights = Array.from({ length: bars }, (_, i) => {
    if (!playing) return 0.18
    const wobble = 0.5 + 0.5 * Math.sin(tick * 0.9 + i * 1.3 + seeds.current[i] * 6)
    if (mode === "audio" && level) {
      const v = Math.min(1, Math.pow(level.peak, 0.6) * 1.25)
      return Math.max(0.16, v * (0.55 + 0.45 * wobble) * seeds.current[i] + 0.06)
    }
    return 0.25 + 0.75 * wobble * seeds.current[i]
  })

  return (
    <div className="flex items-center" style={{ height, gap }} aria-hidden="true">
      {heights.map((h, i) => (
        <motion.span
          key={i}
          className="block rounded-full bg-white"
          style={{ width: barWidth }}
          initial={false}
          animate={{ height: Math.max(barWidth, h * height), opacity: playing ? 0.95 : 0.45 }}
          transition={{ type: "spring", stiffness: 520, damping: 26, mass: 0.4 }}
        />
      ))}
    </div>
  )
}

/** Album art with a neutral placeholder. */
export function Artwork({
  src,
  className,
  rounded = "rounded-xl",
  style,
}: {
  src: string | null | undefined
  className?: string
  rounded?: string
  style?: React.CSSProperties
}) {
  return (
    <div className={cn("relative shrink-0 overflow-hidden bg-white/10", rounded, className)} style={style}>
      {src ? (
        <img src={src} alt="" className="h-full w-full object-cover" draggable={false} />
      ) : (
        <div className="grid h-full w-full place-items-center text-white/40">
          <svg viewBox="0 0 24 24" className="h-1/2 w-1/2" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
        </div>
      )}
    </div>
  )
}

/** Blurred album art used as an ambient background. */
export function AmbientArt({ src, opacity = 0.45 }: { src: string | null | undefined; opacity?: number }) {
  if (!src) return null
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <img
        src={src}
        alt=""
        className="absolute inset-0 h-full w-full scale-150 object-cover blur-3xl saturate-150"
        style={{ opacity }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/45 to-black/70" />
    </div>
  )
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-white/10 px-1.5 font-sans text-[10px] font-medium text-white/60">
      {children}
    </kbd>
  )
}
