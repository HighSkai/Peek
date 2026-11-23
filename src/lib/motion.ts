import { createContext, useContext, useEffect, useState } from "react"
import type { Transition } from "motion/react"
import type { MotionLevel, MotionPreference } from "./types"

// Animation levels. "system" follows Windows: Settings > Accessibility > Visual effects >
// Animation effects, which WebView2 reports as prefers-reduced-motion.
//
//   full     springs with a little overshoot when opening, none when closing
//   reduced  no movement or scaling: short fades and quick size changes without overshoot
//   off      everything changes instantly
//
// Spring values follow Apple's presets (WWDC23 "Animate with springs"): "snappy" is a
// 0.5 s spring with bounce 0.15, "smooth" the same with no bounce.

const QUERY = "(prefers-reduced-motion: reduce)"

export function resolveMotion(pref: MotionPreference, systemReduced: boolean): MotionLevel {
  if (pref === "system") return systemReduced ? "reduced" : "full"
  return pref
}

/** The animation level in use, following the system setting live when set to "system". */
export function useResolvedMotion(pref: MotionPreference): MotionLevel {
  const [reduced, setReduced] = useState(() => window.matchMedia(QUERY).matches)
  useEffect(() => {
    const mq = window.matchMedia(QUERY)
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])
  return resolveMotion(pref, reduced)
}

export const MotionLevelContext = createContext<{ level: MotionLevel; speed: number; bounce: number }>({
  level: "full",
  speed: 1,
  bounce: 0.15,
})

export const useMotion = () => useContext(MotionLevelContext)

const REDUCED_EASE = [0.2, 0, 0, 1] as const

/** Transitions for the island's size, by what the change is. */
export function islandTransition(
  level: MotionLevel,
  kind: "open" | "close" | "morph",
  opts: { speed: number; bounce: number; velocity?: number },
): Transition {
  if (level === "off") return { duration: 0 }
  if (level === "reduced") return { type: "tween", duration: 0.2, ease: REDUCED_EASE }
  const duration = { open: 0.5, close: 0.42, morph: 0.36 }[kind] / opts.speed
  const bounce = kind === "open" ? opts.bounce : kind === "morph" ? opts.bounce * 0.5 : 0
  return { type: "spring", visualDuration: duration, bounce, velocity: opts.velocity ?? 0 }
}

/** Small UI transitions (tabs, pages, menus): quick and without overshoot. */
export function uiTransition(level: MotionLevel, speed = 1): Transition {
  if (level === "off") return { duration: 0 }
  if (level === "reduced") return { duration: 0.15, ease: "linear" }
  return { type: "spring", bounce: 0, visualDuration: 0.28 / speed }
}

/** Enter/exit offsets: movement only at the full level. */
export function slide(level: MotionLevel, px: number) {
  return level === "full" ? px : 0
}
