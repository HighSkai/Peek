import { useEffect, useRef, useState } from "react"
import { motion, useReducedMotion } from "motion/react"
import { cn } from "@/lib/utils"

/** Blinks every few seconds. Returns true while the eyes are closed. */
function useBlink(enabled = true) {
  const [closed, setClosed] = useState(false)
  useEffect(() => {
    if (!enabled) return
    let timer: number
    const schedule = () => {
      timer = window.setTimeout(() => {
        setClosed(true)
        window.setTimeout(() => setClosed(false), 140)
        schedule()
      }, 2400 + Math.random() * 3800)
    }
    schedule()
    return () => window.clearTimeout(timer)
  }, [enabled])
  return closed
}

/** Glances around every now and then. Returns a horizontal offset between -1 and 1. */
function useGlance(enabled = true) {
  const [x, setX] = useState(0)
  useEffect(() => {
    if (!enabled) return
    const id = window.setInterval(() => {
      const r = Math.random()
      setX(r < 0.33 ? -1 : r < 0.66 ? 1 : 0)
    }, 3200)
    return () => window.clearInterval(id)
  }, [enabled])
  return x
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
export function PeekMascot({ className, glow = true }: { className?: string; glow?: boolean }) {
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
      {glow && (
        <div className="pointer-events-none absolute inset-x-[10%] bottom-0 top-[25%] rounded-full bg-white/25 blur-3xl" />
      )}
      <motion.svg
        ref={ref}
        viewBox="96 140 320 230"
        className="relative h-full w-full"
        initial={reduce ? false : { y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", bounce: 0.45, duration: 0.7, delay: 0.1 }}
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

/** Two tiny eyes for the resting island. */
export function PeekEyes({ size = 1, animate = true }: { size?: number; animate?: boolean }) {
  const closed = useBlink(animate)
  const glance = useGlance(animate)
  return (
    <motion.div
      className="flex items-center"
      style={{ gap: 5 * size }}
      initial={false}
      animate={{ x: glance * 3 * size }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
    >
      {[0, 1].map((i) => (
        <motion.span
          key={i}
          className="block rounded-full bg-white"
          style={{ width: 5.5 * size, height: 10 * size }}
          initial={false}
          animate={{ scaleY: closed ? 0.12 : 1 }}
          transition={{ duration: 0.07 }}
        />
      ))}
    </motion.div>
  )
}
