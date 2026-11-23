import NumberFlow, { type Format } from "@number-flow/react"
import { NONE } from "@/lib/format"
import { useMotion } from "@/lib/motion"

// Numbers that roll from one value to the next (NumberFlow), at the full animation level
// only. Stats update every second, so the roll is short (well under half the interval)
// and settles without overshoot; otherwise the digits would always be moving.

const TRANSFORM = { duration: 400, easing: "cubic-bezier(0.2, 0, 0, 1)" }
const SPIN = { duration: 400, easing: "cubic-bezier(0.2, 0, 0, 1)" }
const OPACITY = { duration: 200, easing: "ease-out" }

export function AnimatedNumber({
  value,
  suffix,
  format,
  className,
}: {
  value: number | null | undefined
  suffix?: string
  format?: Format
  className?: string
}) {
  const { level } = useMotion()
  if (value == null || !isFinite(value)) return <span className={className}>{NONE}</span>
  return (
    <NumberFlow
      value={value}
      suffix={suffix}
      format={format}
      className={className}
      animated={level === "full"}
      transformTiming={TRANSFORM}
      spinTiming={SPIN}
      opacityTiming={OPACITY}
      willChange={false}
    />
  )
}

/** Whole-number percentage. */
export function Percent({ value, className }: { value: number | null | undefined; className?: string }) {
  return <AnimatedNumber value={value == null ? value : Math.round(value)} suffix="%" className={className} />
}

/** Temperature in the chosen unit. */
export function Temperature({
  celsius,
  unit,
  className,
}: {
  celsius: number | null | undefined
  unit: "c" | "f"
  className?: string
}) {
  const v = celsius == null ? celsius : unit === "f" ? (celsius * 9) / 5 + 32 : celsius
  return <AnimatedNumber value={v == null ? v : Math.round(v)} suffix={unit === "f" ? "°F" : "°C"} className={className} />
}

/** The time as hours:minutes, each part rolling on its own. */
export function ClockDigits({ date, h24, className }: { date: Date; h24: boolean; className?: string }) {
  const h = date.getHours()
  const hours = h24 ? h : h % 12 || 12
  return (
    <span className={className}>
      <AnimatedNumber value={hours} format={h24 ? { minimumIntegerDigits: 2 } : undefined} />
      <span className="mx-[0.02em]">:</span>
      <AnimatedNumber value={date.getMinutes()} format={{ minimumIntegerDigits: 2 }} />
    </span>
  )
}
