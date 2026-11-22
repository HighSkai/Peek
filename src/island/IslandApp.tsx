import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion, type Transition } from "motion/react"
import { api, EVENTS, inTauri, on, onWindowFocus } from "@/lib/ipc"
import { ACTIVITY_EXTRA, BANNER, COMPACT, DASHBOARD } from "@/lib/layout"
import {
  startAudioSync,
  startHardwareSync,
  startMediaSync,
  startSettingsSync,
  useChat,
  useMedia,
  useSettings,
} from "@/lib/store"
import type { Settings, Tab } from "@/lib/types"
import { Banner, CompactActivity, CompactIdle, CompactStats } from "./compact"
import { Dashboard } from "./Dashboard"

type View = "dashboard" | "banner" | "activity" | "stats" | "idle"
type Reason = "click" | "pull" | "scroll" | "hover" | "command"

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

function Island({ settings }: { settings: Settings }) {
  const media = useMedia((s) => s.media)
  const trackChanges = useMedia((s) => s.trackChanges)

  const [expanded, setExpanded] = useState(false)
  const [tab, setTab] = useState<Tab>(settings.defaultTab)
  const [hovered, setHovered] = useState(false)
  const [pull, setPull] = useState(0)
  const [pulling, setPulling] = useState(false)
  const [banner, setBanner] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [searchNonce, setSearchNonce] = useState(0)
  const [recentlyPlayed, setRecentlyPlayed] = useState(false)

  const expandedRef = useRef(expanded)
  expandedRef.current = expanded
  const pinnedRef = useRef(pinned)
  pinnedRef.current = pinned
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const focusedRef = useRef(false)
  const reasonRef = useRef<Reason>("click")
  const dragRef = useRef<{ y: number; id: number } | null>(null)
  const lastRect = useRef("")

  // ----- expand / collapse ------------------------------------------------

  const expand = useCallback((reason: Reason, opts?: { tab?: Tab | null; focusSearch?: boolean }) => {
    reasonRef.current = reason
    setBanner(false)
    const s = settingsRef.current
    if (opts?.tab) setTab(opts.tab)
    else if (!expandedRef.current) setTab(s.defaultTab)
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
      const prompt = new URLSearchParams(location.search).get("prompt")
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

  // Escape closes the dashboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && expandedRef.current) {
        e.preventDefault()
        collapse()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [collapse])

  // Expand on hover (optional) and collapse again when a hover-opened dashboard is left.
  useEffect(() => {
    if (settings.expandOnHover && hovered && !expanded && !pulling) {
      const t = window.setTimeout(() => expand("hover"), settings.hoverDelayMs)
      return () => window.clearTimeout(t)
    }
    if (expanded && !hovered && reasonRef.current === "hover" && !focusedRef.current && !pinned) {
      const t = window.setTimeout(collapse, 450)
      return () => window.clearTimeout(t)
    }
  }, [hovered, expanded, pulling, pinned, settings.expandOnHover, settings.hoverDelayMs, expand, collapse])

  // Track-change banner.
  useEffect(() => {
    if (trackChanges === 0 || !settings.mediaToast || !settings.featureMedia || expandedRef.current) return
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

  const hasActivity = settings.featureMedia && settings.showMediaActivity && !!media?.available && recentlyPlayed
  const view: View = expanded
    ? "dashboard"
    : banner && media?.available
      ? "banner"
      : hasActivity
        ? "activity"
        : settings.idleContent === "stats" && settings.featureHardware
          ? "stats"
          : "idle"

  const dash = DASHBOARD[settings.dashboardSize]
  const compact = COMPACT[settings.islandSize]
  const notch = settings.mode === "notch"
  const top = notch ? 0 : settings.offsetY

  const size = useMemo(() => {
    let w = compact.w
    let h = compact.h
    if (view === "dashboard") return { ...dash, w: dash.w, h: dash.h }
    if (view === "banner") return { w: BANNER.w, h: BANNER.h }
    if (view === "activity") w += ACTIVITY_EXTRA
    if (view === "stats") w += 64
    if (notch) h += 2
    if (hovered && settings.hoverEffect && settings.animations && !pulling) {
      w += 10
      h += 4
    }
    if (pull > 0) {
      const p = 0.42 * (1 - Math.exp(-pull / 150))
      w += (dash.w - w) * p
      h += (dash.h - h) * p
    }
    return { w, h }
  }, [view, compact, dash, notch, hovered, pull, pulling, settings.hoverEffect, settings.animations])

  const radius = useMemo(() => {
    const bottom = view === "dashboard" ? (notch ? 30 : 36) : view === "banner" ? 28 : notch ? Math.min(16, size.h / 2.3) : size.h / 2
    const topR = notch ? 0 : bottom
    return { tl: topR, tr: topR, bl: bottom, br: bottom }
  }, [view, notch, size.h])

  const speed = settings.animationSpeed || 1
  const spring: Transition = settings.animations
    ? { type: "spring", visualDuration: 0.5 / speed, bounce: settings.bounce }
    : { duration: 0 }
  const transition: Transition = pulling ? { type: "spring", stiffness: 1000, damping: 60 } : spring

  const glass = settings.style === "glass"
  const background = glass ? `rgba(12,12,12,${settings.glassOpacity})` : "#000"
  const open = view === "dashboard"
  const shadow = open
    ? `0px 24px 60px -14px rgba(0,0,0,0.7), inset 0px 0px 0px 1px rgba(255,255,255,${glass ? 0.1 : 0.06})`
    : `0px 6px 18px -8px rgba(0,0,0,0.35), inset 0px 0px 0px 1px rgba(255,255,255,${glass ? 0.08 : 0})`

  // ----- hit testing -----------------------------------------------------------

  const report = useCallback(
    (w: number, h: number) => {
      const full = dragRef.current !== null
      const rect = full
        ? { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight }
        : { x: (window.innerWidth - w) / 2 - 2, y: Math.max(0, top - 2), w: w + 4, h: h + (top > 0 ? 4 : 2) }
      const key = `${Math.round(rect.x)},${Math.round(rect.y)},${Math.round(rect.w)},${Math.round(rect.h)}`
      if (key !== lastRect.current) {
        lastRect.current = key
        api.setHitRect(rect)
      }
    },
    [top],
  )

  const latest = useRef(size)
  useEffect(() => {
    if (!settings.animations) report(size.w, size.h)
  }, [size, settings.animations, report])
  useEffect(() => {
    report(latest.current.w, latest.current.h)
    const onResize = () => report(latest.current.w, latest.current.h)
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [report])

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

  const onPointerDown = (e: React.PointerEvent) => {
    if (expanded || e.button !== 0) return
    dragRef.current = { y: e.clientY, id: e.pointerId }
    e.currentTarget.setPointerCapture(e.pointerId)
    setPulling(true)
    report(size.w, size.h)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return
    setPull(Math.max(0, e.clientY - dragRef.current.y))
  }
  const endDrag = (e: React.PointerEvent, cancelled = false) => {
    const drag = dragRef.current
    if (!drag) return
    dragRef.current = null
    const dy = Math.max(0, e.clientY - drag.y)
    setPulling(false)
    setPull(0)
    if (!cancelled && (dy > 36 || dy < 6)) {
      expand(dy > 36 ? "pull" : "click", view === "banner" ? { tab: "media" } : undefined)
    }
  }

  const content = (() => {
    switch (view) {
      case "dashboard":
        return (
          <Dashboard
            settings={settings}
            width={dash.w}
            height={dash.h}
            tab={tab}
            setTab={setTab}
            pinned={pinned}
            setPinned={setPinned}
            onCollapse={collapse}
            searchNonce={searchNonce}
          />
        )
      case "banner":
        return media && <Banner media={media} settings={settings} />
      case "activity":
        return media && <CompactActivity media={media} settings={settings} height={compact.h} />
      case "stats":
        return <CompactStats settings={settings} />
      default:
        return <CompactIdle settings={settings} height={compact.h} />
    }
  })()

  const fade = settings.animations
    ? {
        initial: { opacity: 0, filter: "blur(6px)", scale: 0.97 },
        animate: { opacity: 1, filter: "blur(0px)", scale: 1 },
        exit: { opacity: 0, filter: "blur(4px)", scale: 0.98, transition: { duration: 0.12 } },
        transition: { duration: 0.28 / speed, delay: open ? 0.06 / speed : 0.04 },
      }
    : { initial: false as const, animate: { opacity: 1 }, exit: { opacity: 0, transition: { duration: 0 } } }

  return (
    <div className="pointer-events-none absolute inset-x-0 flex justify-center" style={{ top }}>
      <motion.div
        className="pointer-events-auto relative"
        initial={false}
        animate={{ width: size.w, height: size.h }}
        transition={transition}
        onUpdate={(v) => {
          const w = typeof v.width === "number" ? v.width : size.w
          const h = typeof v.height === "number" ? v.height : size.h
          latest.current = { w, h }
          report(w, h)
        }}
        onAnimationComplete={() => report(size.w, size.h)}
        onMouseEnter={inTauri ? undefined : () => setHovered(true)}
        onMouseLeave={inTauri ? undefined : () => setHovered(false)}
      >
        {notch && <NotchEars color={background} />}
        <motion.div
          className="absolute inset-0 overflow-hidden"
          style={{ background, backdropFilter: glass ? "blur(24px) saturate(140%)" : undefined }}
          initial={false}
          animate={{
            borderTopLeftRadius: radius.tl,
            borderTopRightRadius: radius.tr,
            borderBottomLeftRadius: radius.bl,
            borderBottomRightRadius: radius.br,
            boxShadow: shadow,
          }}
          transition={transition}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(e) => endDrag(e)}
          onPointerCancel={(e) => endDrag(e, true)}
          onWheel={(e) => {
            if (!expanded && e.deltaY > 0) expand("scroll")
          }}
        >
          <AnimatePresence initial={false}>
            <motion.div key={view} className="absolute inset-0" {...fade}>
              {content}
            </motion.div>
          </AnimatePresence>
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
