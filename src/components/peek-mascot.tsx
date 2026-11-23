import { useEffect, useRef, useState } from "react"
import { motion, useReducedMotion } from "motion/react"
import { cn } from "@/lib/utils"

export interface Look {
  /** -1 (left) to 1 (right). */
  x: number
  /** -1 (up) to 1 (down). */
  y: number
}

/** Blinks every few seconds, sometimes twice. Returns true while the eyes are closed. */
function useBlink(enabled = true) {
  const [closed, setClosed] = useState(false)
  useEffect(() => {
    if (!enabled) return
    let timer: number
    const blink = (then: () => void) => {
      setClosed(true)
      timer = window.setTimeout(() => {
        setClosed(false)
        then()
      }, 120)
    }
    const schedule = () => {
      timer = window.setTimeout(() => {
        const twice = Math.random() < 0.2
        blink(() => {
          if (twice) timer = window.setTimeout(() => blink(schedule), 140)
          else schedule()
        })
      }, 2600 + Math.random() * 4200)
    }
    schedule()
    return () => window.clearTimeout(timer)
  }, [enabled])
  return closed
}

/** Where the eyes look when nothing is going on: mostly up and to the right, like the logo. */
const REST: Look = { x: 0.45, y: -0.35 }
const GLANCES: Look[] = [REST, REST, { x: -0.9, y: 0 }, { x: 0.9, y: 0.1 }, { x: 0, y: 0.5 }, { x: -0.5, y: -0.5 }]

/** Glances around every few seconds. */
function useGlance(enabled = true) {
  const [look, setLook] = useState<Look>(REST)
  useEffect(() => {
    if (!enabled) {
      setLook(REST)
      return
    }
    let timer: number
    const next = () => {
      timer = window.setTimeout(() => {
        setLook(GLANCES[Math.floor(Math.random() * GLANCES.length)])
        next()
      }, 1800 + Math.random() * 2600)
    }
    next()
    return () => window.clearTimeout(timer)
  }, [enabled])
  return look
}

/**
 * The Peek character: a little head peeking over a line, with paws on the wall.
 * Uses `currentColor` for ink so it adapts to light and dark backgrounds.
 */
export function PeekMark({ className, paper = "var(--peek-paper, #fff)" }: { className?: string; paper?: string }) {
  return (
    <svg viewBox="48 128 416 256" className={className} aria-hidden="true">
      <g fill={paper} stroke="currentColor" strokeLinejoin="round">
        <path d="M152 357 V262 C152 199 198 152 256 152 C314 152 360 199 360 262 V357" strokeWidth="18" />
        <ellipse cx="290" cy="262" rx="34" ry="46" strokeWidth="14" />
        <circle cx="303" cy="251" r="14" fill="currentColor" stroke="none" />
        <ellipse cx="226" cy="262" rx="36" ry="48" strokeWidth="14" />
        <circle cx="240" cy="250" r="14" fill="currentColor" stroke="none" />
      </g>
      <line x1="64" y1="357" x2="448" y2="357" stroke="currentColor" strokeWidth="18" strokeLinecap="round" />
      <g fill={paper} stroke="currentColor" strokeWidth="13">
        <ellipse cx="146" cy="352" rx="30" ry="21" />
        <ellipse cx="366" cy="352" rx="30" ry="21" />
      </g>
      <path d="M138 333 V343 M154 333 V343 M358 333 V343 M374 333 V343" stroke="currentColor" strokeWidth="8" strokeLinecap="round" />
    </svg>
  )
}

/** App-icon style badge: white character on a black rounded square. */
export function PeekBadge({ className }: { className?: string }) {
  return (
    <div className={cn("grid place-items-center rounded-[22%] bg-[#0a0a0a] text-[#0a0a0a] ring-1 ring-white/10", className)}>
      <PeekMark className="w-[78%] translate-y-[6%]" paper="#fafafa" />
    </div>
  )
}

/**
 * Animated mascot for empty states: peeks up over the bottom edge, blinks and
 * follows the pointer with its eyes.
 */
export function PeekMascot({ className }: { className?: string }) {
  const reduce = useReducedMotion()
  const closed = useBlink(!reduce)
  const ref = useRef<SVGSVGElement>(null)
  const [look, setLook] = useState({ x: 0.6, y: -0.4 })

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const el = ref.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const dx = e.clientX - (r.left + r.width / 2)
      const dy = e.clientY - (r.top + r.height * 0.45)
      const d = Math.max(1, Math.hypot(dx, dy))
      const k = Math.min(1, d / 160)
      setLook({ x: (dx / d) * k, y: (dy / d) * k })
    }
    window.addEventListener("pointermove", onMove)
    return () => window.removeEventListener("pointermove", onMove)
  }, [])

  const px = look.x * 11
  const py = look.y * 14
  const eye = (cx: number, rx: number, ry: number, pcx: number) => (
    <g>
      <motion.ellipse
        cx={cx}
        cy={262}
        rx={rx}
        initial={false}
        animate={{ ry: closed ? 3 : ry }}
        transition={{ duration: 0.08 }}
        fill="#fafafa"
        stroke="#0a0a0a"
        strokeWidth={14}
      />
      {!closed && (
        <motion.circle
          r={14}
          fill="#0a0a0a"
          initial={false}
          animate={{ cx: pcx + px, cy: 258 + py }}
          transition={{ type: "spring", stiffness: 260, damping: 22 }}
        />
      )}
    </g>
  )

  return (
    <div className={cn("relative", className)}>
      <motion.svg
        ref={ref}
        viewBox="96 140 320 230"
        className="relative h-full w-full"
        initial={reduce ? false : { y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", bounce: 0.35, visualDuration: 0.5, delay: 0.1 }}
        aria-hidden="true"
      >
        <path
          d="M152 362 V262 C152 199 198 152 256 152 C314 152 360 199 360 262 V362 Z"
          fill="#fafafa"
          stroke="#0a0a0a"
          strokeWidth={14}
          strokeLinejoin="round"
        />
        {eye(290, 34, 46, 290)}
        {eye(226, 36, 48, 226)}
        <g fill="#fafafa" stroke="#0a0a0a" strokeWidth={13}>
          <ellipse cx={146} cy={352} rx={30} ry={21} />
          <ellipse cx={366} cy={352} rx={30} ry={21} />
        </g>
        <path
          d="M138 333 V343 M154 333 V343 M358 333 V343 M374 333 V343"
          stroke="#0a0a0a"
          strokeWidth={8}
          strokeLinecap="round"
        />
      </motion.svg>
    </div>
  )
}

// Eye geometry in a 26 x 14 box: two tall ovals that almost touch, like the logo.
const EYE_CENTERS = [7.4, 18.6]
const EYE_RX = 4.7
const EYE_RY = 6.3
const PUPIL_R = 2.55

/**
 * Peek's eyes for the resting island: white ovals with dark pupils that blink, glance
 * around, and look wherever `look` points (the pointer, or down while being pulled).
 */
export function PeekEyes({
  size = 14,
  animate = true,
  look,
  className,
}: {
  /** Height in pixels. */
  size?: number
  animate?: boolean
  look?: Look | null
  className?: string
}) {
  const reduce = useReducedMotion()
  const live = animate && !reduce
  const closed = useBlink(live)
  const glance = useGlance(live && !look)
  const target = look ?? glance
  const px = Math.max(-1, Math.min(1, target.x)) * (EYE_RX - PUPIL_R - 0.55)
  const py = Math.max(-1, Math.min(1, target.y)) * (EYE_RY - PUPIL_R - 0.9)

  return (
    <svg
      viewBox="0 0 26 14"
      width={(size * 26) / 14}
      height={size}
      className={cn("block overflow-visible", className)}
      aria-hidden="true"
    >
      {EYE_CENTERS.map((cx) => (
        <motion.g
          key={cx}
          initial={false}
          animate={{ scaleY: closed ? 0.1 : 1 }}
          transition={closed ? { duration: 0.06, ease: "easeIn" } : { duration: 0.12, ease: "easeOut" }}
        >
          <ellipse cx={cx} cy={7} rx={EYE_RX} ry={EYE_RY} fill="#fafafa" />
          <motion.circle
            r={PUPIL_R}
            fill="#0a0a0a"
            initial={false}
            animate={{ cx: cx + px, cy: 7 + py }}
            transition={{ type: "spring", stiffness: 420, damping: 28, mass: 0.6 }}
          />
        </motion.g>
      ))}
    </svg>
  )
}
