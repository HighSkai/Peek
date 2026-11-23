import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react"
import type { Look } from "@/components/peek-mascot"
import { PopoverBoundary } from "@/components/ui/select"
import { api, EVENTS, inTauri, on, onWindowFocus } from "@/lib/ipc"
import {
  ACTIVITY_EXTRA,
  BANNER,
  COMPACT,
  DASHBOARD,
  DASHBOARD_RADIUS,
  DENSITY_SCALE,
  scaled,
  STATS_EXTRA,
} from "@/lib/layout"
import {
  startAudioSync,
  startHardwareSync,
  startMediaSync,
  startSettingsSync,
  useChat,
  useIslandUi,
  useMedia,
  useSettings,
} from "@/lib/store"
import type { Settings, Tab } from "@/lib/types"
import { Banner, CompactActivity, CompactIdle, CompactStats } from "./compact"
import { Dashboard } from "./Dashboard"

type View = "dashboard" | "banner" | "activity" | "stats" | "idle" | "hidden"
type Reason = "click" | "pull" | "scroll" | "hover" | "command"
type Size = { w: number; h: number }

/** Pixels the pointer must travel before a press becomes a drag. */
const DRAG_SLOP = 4
/** How far past fully open the dashboard can be stretched. */
const STRETCH = 34

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
/** iOS-style rubber band: gives way less and less the further it's pulled. */
const rubber = (distance: number, limit: number) => limit * (1 - 1 / ((distance * 0.55) / limit + 1))

export default function IslandApp() {
  const settings = useSettings((s) => s.settings)

  useEffect(() => {
    document.documentElement.classList.add("island", "dark")
    startSettingsSync()
    startHardwareSync()
    startMediaSync()
    startAudioSync()
  }, [])

  if (!settings) return null
  return <Island settings={settings} />
}

interface DragState {
  id: number
  startY: number
  /** Whether the island was open when the press started. */
  from: 0 | 1
  /** Openness when the drag took over (the island may have been mid-spring). */
  base: number
  active: boolean
  samples: { t: number; y: number }[]
  /** Openness right now, unclamped. */
  p: number
}

function Island({ settings }: { settings: Settings }) {
  const media = useMedia((s) => s.media)
  const trackChanges = useMedia((s) => s.trackChanges)
  const tab = useIslandUi((s) => s.tab)

  const [expanded, setExpanded] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [pulling, setPulling] = useState(false)
  /** While pulling the resting island down, the dashboard is drawn as it opens. */
  const [dragOpen, setDragOpen] = useState(false)
  const [banner, setBanner] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [searchNonce, setSearchNonce] = useState(0)
  const [recentlyPlayed, setRecentlyPlayed] = useState(false)
  const [look, setLook] = useState<Look | null>(null)
  const [surface, setSurface] = useState<HTMLDivElement | null>(null)

  const expandedRef = useRef(expanded)
  expandedRef.current = expanded
  const pinnedRef = useRef(pinned)
  pinnedRef.current = pinned
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const focusedRef = useRef(false)
  const reasonRef = useRef<Reason>("click")
  const dragRef = useRef<DragState | null>(null)

  // ----- expand / collapse ------------------------------------------------

  const expand = useCallback((reason: Reason, opts?: { tab?: Tab | null; focusSearch?: boolean }) => {
    reasonRef.current = reason
    setBanner(false)
    const ui = useIslandUi.getState()
    if (opts?.tab === "settings") ui.openSettings()
    else if (opts?.tab) ui.setTab(opts.tab)
    else if (!expandedRef.current) ui.setTab(settingsRef.current.defaultTab)
    if (opts?.focusSearch) setSearchNonce((n) => n + 1)
    setExpanded(true)
    api.setExpanded(true, reason !== "hover")
  }, [])

  const collapse = useCallback(() => {
    if (!expandedRef.current) return
    setExpanded(false)
    setPinned(false)
    api.setExpanded(false, false)
  }, [])

  // Tell the backend we're ready once the first frame is painted.
  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => api.islandReady()))
    if (!inTauri) {
      const params = new URLSearchParams(location.search)
      const prompt = params.get("prompt")
      const page = params.get("page")
      if (page) useIslandUi.getState().setSettingsPage(page as never)
      if (prompt) {
        setTimeout(() => {
          expand("command", { tab: "ask" })
          useChat.getState().send(prompt)
        }, 300)
      }
    }
  }, [expand])

  // Commands from the tray and the global shortcut.
  useEffect(
    () =>
      on(EVENTS.command, (cmd) => {
        if (cmd.action === "collapse") collapse()
        else if (cmd.action === "toggle" && expandedRef.current) collapse()
        else expand("command", { tab: cmd.tab, focusSearch: cmd.focusSearch })
      }),
    [expand, collapse],
  )

  // Hover comes from the backend because the window ignores the mouse outside the island.
  useEffect(() => (inTauri ? on(EVENTS.hover, setHovered) : undefined), [])
  useEffect(() => {
    if (!hovered) setLook(null)
  }, [hovered])

  // Collapse when focus moves to another window.
  useEffect(
    () =>
      onWindowFocus((focused) => {
        focusedRef.current = focused
        if (!focused && expandedRef.current && settingsRef.current.collapseOnBlur && !pinnedRef.current) {
          collapse()
        }
      }),
    [collapse],
  )

  // Escape closes the dashboard, unless a menu or the shortcut recorder took it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && expandedRef.current && !e.defaultPrevented) {
        e.preventDefault()
        collapse()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [collapse])

  // Expand on hover (optional) and collapse again when a hover-opened dashboard is left.
  useEffect(() => {
    if (settings.expandOnHover && hovered && !expanded && !pulling && settings.reveal === "always") {
      const t = window.setTimeout(() => expand("hover"), settings.hoverDelayMs)
      return () => window.clearTimeout(t)
    }
    if (expanded && !hovered && reasonRef.current === "hover" && !focusedRef.current && !pinned) {
      const t = window.setTimeout(collapse, 450)
      return () => window.clearTimeout(t)
    }
  }, [hovered, expanded, pulling, pinned, settings.expandOnHover, settings.hoverDelayMs, settings.reveal, expand, collapse])

  // Track-change banner (not in hotkey mode, where the island stays out of sight).
  useEffect(() => {
    if (trackChanges === 0 || !settings.mediaToast || !settings.featureMedia || expandedRef.current) return
    if (settingsRef.current.reveal === "hotkey") return
    setBanner(true)
    const t = window.setTimeout(() => setBanner(false), 4200)
    return () => window.clearTimeout(t)
  }, [trackChanges, settings.mediaToast, settings.featureMedia])

  // Keep the live activity for a couple of minutes after playback pauses.
  useEffect(() => {
    if (media?.available && media.playing) {
      setRecentlyPlayed(true)
      return
    }
    if (!media?.available) {
      setRecentlyPlayed(false)
      return
    }
    const t = window.setTimeout(() => setRecentlyPlayed(false), 120_000)
    return () => window.clearTimeout(t)
  }, [media?.available, media?.playing])

  // ----- layout --------------------------------------------------------------

  const scale = DENSITY_SCALE[settings.density] ?? 1
  const layout = DASHBOARD[settings.dashboardSize]
  const dash = scaled(layout, scale)
  const compactLayout = COMPACT[settings.islandSize]
  const notch = settings.mode === "notch"
  const top = notch ? 0 : settings.offsetY
  const hotkey = settings.reveal === "hotkey"

  const hasActivity = settings.featureMedia && settings.showMediaActivity && !!media?.available && recentlyPlayed
  const closedView: Exclude<View, "dashboard"> = hotkey
    ? "hidden"
    : banner && media?.available
      ? "banner"
      : hasActivity
        ? "activity"
        : settings.idleContent === "stats" && settings.featureHardware
          ? "stats"
          : "idle"
  const view: View = expanded || dragOpen ? "dashboard" : closedView

  /** Size of the island when it isn't open. */
  const closed = useMemo<Size>(() => {
    if (closedView === "banner") return scaled(BANNER, scale)
    let w = compactLayout.w
    let h = compactLayout.h
    if (closedView === "hidden") w *= 0.72
    if (closedView === "activity") w += ACTIVITY_EXTRA
    if (closedView === "stats") w += STATS_EXTRA
    if (notch) h += 2
    const s = scaled({ w, h }, scale)
    if (hovered && settings.hoverEffect && settings.animations && closedView !== "hidden") {
      s.w += 8
      s.h += 3
    }
    return s
  }, [closedView, compactLayout, scale, notch, hovered, settings.hoverEffect, settings.animations])

  const rest = view === "dashboard" ? dash : closed
  /** Hotkey mode tucks the island above the top edge of the screen. */
  const restY = view === "hidden" ? -(top + closed.h + 16) : 0

  const closedRadius =
    closedView === "banner"
      ? (notch ? 18 : 22) * scale
      : notch
        ? Math.min(14 * scale, closed.h / 2.3)
        : closed.h / 2
  const dashRadius = (notch ? DASHBOARD_RADIUS.notch : DASHBOARD_RADIUS.island) * scale

  // Refs for the gesture handlers and motion transforms, which run outside React renders.
  const geo = useRef({ closed, dash, closedRadius, dashRadius, notch, top })
  geo.current = { closed, dash, closedRadius, dashRadius, notch, top }

  // ----- motion ----------------------------------------------------------------

  const w = useMotionValue(rest.w)
  const h = useMotionValue(rest.h)
  const y = useMotionValue(restY)

  /** 0 when resting, 1 when fully open, a little more while stretched. */
  const progress = useTransform(() => {
    const g = geo.current
    return clamp((h.get() - g.closed.h) / Math.max(1, g.dash.h - g.closed.h), 0, 1.2)
  })
  const radius = useTransform(() => {
    const g = geo.current
    const p = clamp(progress.get(), 0, 1)
    return Math.min(h.get() / 2, lerp(g.closedRadius, g.dashRadius, p))
  })
  const topRadius = useTransform(() => (geo.current.notch ? 0 : radius.get()))
  const glass = settings.style === "glass"
  const shadow = useTransform(() => {
    const p = clamp(progress.get(), 0, 1)
    const ring = glass ? lerp(0.08, 0.1, p) : lerp(0, 0.06, p)
    return `0px ${lerp(6, 22, p)}px ${lerp(18, 56, p)}px -${lerp(8, 14, p)}px rgba(0,0,0,${lerp(0.35, 0.7, p)}), inset 0px 0px 0px 1px rgba(255,255,255,${ring})`
  })
  // The dashboard fades in step with how far open the island is, and scales with its
  // width, so while dragging or springing it looks drawn out of (and back into) the
  // island instead of being cropped by it.
  const dashOpacity = useTransform(progress, [0.1, 0.55], [0, 1])
  // The resting content (eyes, music, clock) gives way over the first part of the pull.
  const compactOpacity = useTransform(progress, [0.02, 0.14], [1, 0])
  const dashScale = useTransform(() => clamp(w.get() / Math.max(1, geo.current.dash.w), 0.55, 1))

  // ----- hit testing -----------------------------------------------------------

  const lastRect = useRef("")
  const lastReported = useRef<{ size: Size; empty: boolean }>({ size: rest, empty: false })
  const report = useCallback((size: Size, empty = false) => {
    lastReported.current = { size, empty }
    const g = geo.current
    const rect = empty
      ? { x: -100_000, y: -100_000, w: 0, h: 0 }
      : dragRef.current
        ? { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight }
        : {
            x: (window.innerWidth - size.w) / 2 - 2,
            y: Math.max(0, g.top - 2),
            w: size.w + 4,
            h: size.h + (g.top > 0 ? 4 : 2),
          }
    const key = `${Math.round(rect.x)},${Math.round(rect.y)},${Math.round(rect.w)},${Math.round(rect.h)}`
    if (key !== lastRect.current) {
      lastRect.current = key
      api.setHitRect(rect)
    }
  }, [])

  useEffect(() => {
    const onResize = () => report(lastReported.current.size, lastReported.current.empty)
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [report])

  // ----- springs -------------------------------------------------------------------

  const anims = useRef<AnimationPlaybackControls[]>([])
  const runId = useRef(0)
  const target = useRef<{ w: number; h: number; y: number } | null>(null)

  /**
   * Spring the island to a size. `vw`/`vh` carry the speed of a released drag into the
   * spring, which is what makes a flick feel like it has weight.
   */
  const springTo = useCallback(
    (size: Size, toY: number, opts: { vw?: number; vh?: number; empty?: boolean } = {}) => {
      const s = settingsRef.current
      anims.current.forEach((a) => a.stop())
      target.current = { w: size.w, h: size.h, y: toY }

      const grow = size.h - h.get()
      const kind = grow > 24 ? "open" : grow < -24 ? "close" : "morph"
      const speed = s.animationSpeed || 1
      const duration = (kind === "open" ? 0.46 : kind === "close" ? 0.4 : 0.34) / speed
      const bounce = kind === "open" ? s.bounce : kind === "close" ? s.bounce * 0.6 : s.bounce * 0.8
      const spring = (velocity = 0) =>
        s.animations
          ? { type: "spring" as const, visualDuration: duration, bounce, velocity }
          : { duration: 0 }

      // Cover both the current and the target size while moving; trim it at the end.
      report({ w: Math.max(w.get(), size.w), h: Math.max(h.get(), size.h) })
      const id = ++runId.current
      const list = [
        animate(w, size.w, spring(opts.vw)),
        animate(h, size.h, spring(opts.vh)),
        animate(y, toY, spring(0)),
      ]
      anims.current = list
      Promise.all(list).then(() => {
        if (runId.current === id) report(size, opts.empty)
      })
    },
    [w, h, y, report],
  )

  // Follow the resting size: view changes, hover, settings. Skipped mid-drag.
  const mounted = useRef(false)
  useLayoutEffect(() => {
    const empty = view === "hidden"
    if (!mounted.current) {
      mounted.current = true
      w.set(rest.w)
      h.set(rest.h)
      y.set(restY)
      target.current = { w: rest.w, h: rest.h, y: restY }
      report(rest, empty)
      return
    }
    if (dragRef.current?.active) return
    const t = target.current
    if (t && t.w === rest.w && t.h === rest.h && t.y === restY) return
    springTo(rest, restY, { empty })
  }, [rest.w, rest.h, restY, view, springTo, report, w, h, y, rest])

  // ----- background work toggles -----------------------------------------------

  const metering =
    settings.featureMedia &&
    settings.visualizer === "audio" &&
    !!media?.playing &&
    (view === "activity" || view === "banner" || (view === "dashboard" && (tab === "home" || tab === "media")))
  useEffect(() => {
    api.setMetering(metering)
  }, [metering])

  useEffect(() => {
    api.hardwareSetCompact(view === "stats")
  }, [view])

  // ----- gestures ----------------------------------------------------------------
  //
  // One gesture covers both directions. Pull the resting island down and the dashboard
  // opens under the pointer; grab the open dashboard by its header or the handle at the
  // bottom and push it back up to close. Letting go hands the pointer's speed to the
  // spring, so a quick flick finishes the motion and a slow drag can be put back.

  const applyDrag = (d: DragState) => {
    const g = geo.current
    const range = Math.max(1, g.dash.h - g.closed.h)
    let height: number
    let p = d.p
    if (p > 1) {
      height = g.dash.h + rubber((p - 1) * range, STRETCH)
      p = 1
    } else if (p < 0) {
      height = g.closed.h - rubber(-p * range, 3)
      p = 0
    } else {
      height = lerp(g.closed.h, g.dash.h, p)
    }
    // Width leads height a little, so the island widens into a sheet as it drops.
    const width = lerp(g.closed.w, g.dash.w, 1 - (1 - p) * (1 - p))
    w.set(width)
    h.set(height)
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || view === "hidden") return
    const el = e.target as HTMLElement
    if (expandedRef.current) {
      // When open, only the header and the handle drag; everything else stays interactive.
      if (!el.closest("[data-drag-handle]")) return
      if (el.closest("button, a, input, textarea, select, [role=slider], [role=combobox], [data-no-drag]")) return
    } else if (el.closest("[data-no-drag]")) {
      return
    }
    const from = expandedRef.current ? 1 : 0
    dragRef.current = {
      id: e.pointerId,
      startY: e.clientY,
      from,
      base: from,
      active: false,
      samples: [{ t: performance.now(), y: e.clientY }],
      p: from,
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    // Keep the pointer while it's held, even if it leaves the island.
    report(lastReported.current.size)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (!d) {
      // Peek watches the pointer while it's over the resting island.
      if (!expandedRef.current && view === "idle") {
        const r = e.currentTarget.getBoundingClientRect()
        const x = clamp(((e.clientX - (r.left + r.width / 2)) / (r.width / 2)) * 1.3, -1, 1)
        const yy = clamp((e.clientY - (r.top + r.height / 2)) / (r.height / 2), -1, 1)
        setLook({ x: Math.round(x * 10) / 10, y: Math.round(yy * 10) / 10 })
      }
      return
    }
    const g = geo.current
    const range = Math.max(1, g.dash.h - g.closed.h)
    if (!d.active) {
      if (Math.abs(e.clientY - d.startY) < DRAG_SLOP) return
      // Take over from any running spring, starting from wherever the island is now.
      anims.current.forEach((a) => a.stop())
      d.active = true
      d.startY = e.clientY
      d.base = clamp((h.get() - g.closed.h) / range, 0, 1)
      setPulling(true)
    }
    const now = performance.now()
    d.samples.push({ t: now, y: e.clientY })
    if (d.samples.length > 8) d.samples.shift()
    d.p = d.base + (e.clientY - d.startY) / range
    applyDrag(d)
    if (d.from === 0) {
      // Draw the dashboard once the pull is clearly a pull; it fades in with progress.
      if (d.p > 0.06) setDragOpen(true)
      else if (d.p < 0.02) setDragOpen(false)
    }
  }

  const endDrag = (e: React.PointerEvent<HTMLDivElement>, cancelled = false) => {
    const d = dragRef.current
    if (!d || d.id !== e.pointerId) return
    dragRef.current = null
    setPulling(false)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)

    const g = geo.current
    if (!d.active) {
      // A tap: open the resting island, or close from the handle.
      setDragOpen(false)
      report(lastReported.current.size)
      if (cancelled) return
      if (d.from === 0) expand("click", view === "banner" ? { tab: "media" } : undefined)
      else if ((e.target as HTMLElement).closest("[data-grabber]")) collapse()
      return
    }

    // Pointer speed over the last ~100 ms, in px/s.
    const now = performance.now()
    const recent = d.samples.filter((s) => now - s.t < 110)
    let vh = 0
    if (recent.length >= 2) {
      const a = recent[0]
      const b = recent[recent.length - 1]
      if (b.t > a.t) vh = ((b.y - a.y) / (b.t - a.t)) * 1000
    }
    const range = Math.max(1, g.dash.h - g.closed.h)
    // Project where a flick would come to rest, then pick the nearer end.
    const projected = cancelled ? d.from : d.p + (vh * 0.18) / range
    const open = projected > 0.5
    const vw = vh * ((g.dash.w - g.closed.w) / range)

    setDragOpen(false)
    if (open) {
      springTo(g.dash, 0, { vw, vh })
      if (!expandedRef.current) expand("pull", view === "banner" ? { tab: "media" } : undefined)
    } else {
      const toY = settingsRef.current.reveal === "hotkey" ? -(g.top + g.closed.h + 16) : 0
      springTo(g.closed, toY, { vw, vh, empty: settingsRef.current.reveal === "hotkey" })
      if (expandedRef.current) collapse()
    }
  }

  // ----- render --------------------------------------------------------------------

  const background = glass ? `rgba(12,12,12,${settings.glassOpacity})` : "#000"
  const anim = settings.animations
  const eyesLook: Look | null = pulling && !expanded ? { x: 0, y: 1 } : look
  // While the resting island is being pulled open, both layers are drawn and cross-fade.
  const showCompact = view !== "dashboard" || (dragOpen && !expanded)

  const compactContent = (() => {
    switch (closedView) {
      case "banner":
        return media && <Banner media={media} settings={settings} />
      case "activity":
        return media && <CompactActivity media={media} settings={settings} height={compactLayout.h} />
      case "stats":
        return <CompactStats settings={settings} />
      case "hidden":
        return null
      default:
        return <CompactIdle settings={settings} height={compactLayout.h} look={eyesLook} />
    }
  })()

  return (
    <div className="pointer-events-none absolute inset-x-0 flex justify-center" style={{ top }}>
      <motion.div
        className="pointer-events-auto relative"
        style={{ width: w, height: h, y }}
        onMouseEnter={inTauri ? undefined : () => setHovered(true)}
        onMouseLeave={inTauri ? undefined : () => setHovered(false)}
      >
        {notch && <NotchEars color={background} />}
        <motion.div
          ref={setSurface}
          data-dragging={pulling || undefined}
          className="group/island absolute inset-0 overflow-hidden"
          style={{
            background,
            backdropFilter: glass ? "blur(24px) saturate(140%)" : undefined,
            borderTopLeftRadius: topRadius,
            borderTopRightRadius: topRadius,
            borderBottomLeftRadius: radius,
            borderBottomRightRadius: radius,
            boxShadow: shadow,
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerLeave={() => !dragRef.current && setLook(null)}
          onPointerUp={(e) => endDrag(e)}
          onPointerCancel={(e) => endDrag(e, true)}
          onLostPointerCapture={(e) => dragRef.current && endDrag(e, true)}
          onWheel={(e) => {
            if (!expanded && e.deltaY > 0 && view !== "hidden") expand("scroll")
          }}
        >
          <PopoverBoundary.Provider value={surface}>
            <AnimatePresence initial={false}>
              {showCompact && (
                <motion.div
                  key={closedView}
                  className="absolute inset-0"
                  initial={anim ? { opacity: 0, scale: 0.82 } : false}
                  animate={{ opacity: 1, scale: 1, transition: { duration: 0.24, delay: anim ? 0.08 : 0, ease: [0.2, 0.8, 0.2, 1] } }}
                  exit={anim ? { opacity: 0, scale: 0.9, transition: { duration: 0.1 } } : { opacity: 0, transition: { duration: 0 } }}
                >
                  <motion.div className="absolute inset-0" style={{ zoom: scale, opacity: compactOpacity }}>
                    {compactContent}
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
            <AnimatePresence initial={false}>
              {view === "dashboard" && (
                <motion.div
                  key="dashboard"
                  className="absolute inset-0"
                  exit={{ opacity: 0, transition: { duration: anim ? 0.14 : 0 } }}
                >
                  <motion.div
                    className="absolute inset-x-0 top-0"
                    style={{ opacity: dashOpacity, scale: dashScale, transformOrigin: "50% 0%" }}
                  >
                    <div
                      className="absolute left-1/2 top-0 -translate-x-1/2"
                      style={{ width: layout.w, height: layout.h, zoom: scale }}
                    >
                      <Dashboard
                        settings={settings}
                        width={layout.w}
                        height={layout.h}
                        pinned={pinned}
                        setPinned={setPinned}
                        onCollapse={collapse}
                        searchNonce={searchNonce}
                      />
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </PopoverBoundary.Provider>
        </motion.div>
      </motion.div>
    </div>
  )
}

/** Concave corners that make the notch look like it grows out of the screen edge. */
function NotchEars({ color, r = 10 }: { color: string; r?: number }) {
  const common = { top: 0, width: r, height: r } as const
  return (
    <>
      <span
        className="pointer-events-none absolute"
        style={{ ...common, left: -r, background: `radial-gradient(circle at 0 100%, transparent ${r - 0.5}px, ${color} ${r}px)` }}
      />
      <span
        className="pointer-events-none absolute"
        style={{ ...common, right: -r, background: `radial-gradient(circle at 100% 100%, transparent ${r - 0.5}px, ${color} ${r}px)` }}
      />
    </>
  )
}
