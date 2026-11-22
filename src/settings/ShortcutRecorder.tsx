import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { cn } from "@/lib/utils"

const MODIFIER_CODES = new Set([
  "ControlLeft", "ControlRight", "ShiftLeft", "ShiftRight", "AltLeft", "AltRight", "MetaLeft", "MetaRight",
])

/** Shortcut string in the format understood by tauri-plugin-global-shortcut. */
function fromEvent(e: React.KeyboardEvent): string | null {
  if (MODIFIER_CODES.has(e.code)) return null
  const mods: string[] = []
  if (e.ctrlKey) mods.push("Ctrl")
  if (e.altKey) mods.push("Alt")
  if (e.shiftKey) mods.push("Shift")
  if (e.metaKey) mods.push("Super")
  const isFn = /^F\d{1,2}$/.test(e.code)
  if (mods.length === 0 && !isFn) return null
  return [...mods, e.code].join("+")
}

export function prettyKey(part: string) {
  return part
    .replace(/^Key([A-Z])$/, "$1")
    .replace(/^Digit(\d)$/, "$1")
    .replace(/^Arrow/, "")
    .replace("Super", "Win")
    .replace("Backquote", "`")
    .replace("Period", ".")
    .replace("Comma", ",")
    .replace("Slash", "/")
    .replace("Semicolon", ";")
}

export function ShortcutRecorder({
  value,
  onChange,
  defaultValue,
}: {
  value: string
  onChange: (v: string) => void
  defaultValue: string
}) {
  const [recording, setRecording] = useState(false)
  const parts = value ? value.split("+") : []
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setRecording(true)}
        onBlur={() => setRecording(false)}
        onKeyDown={(e) => {
          if (!recording) return
          e.preventDefault()
          e.stopPropagation()
          if (e.key === "Escape") return setRecording(false)
          if (e.key === "Backspace" || e.key === "Delete") {
            onChange("")
            return setRecording(false)
          }
          const sc = fromEvent(e)
          if (sc) {
            onChange(sc)
            setRecording(false)
          }
        }}
        className={cn(
          "flex h-9 min-w-44 items-center justify-center gap-1 rounded-md border bg-background/60 px-3 text-sm shadow-xs outline-none transition",
          recording ? "border-ring ring-[3px] ring-ring/40" : "hover:bg-accent",
        )}
      >
        {recording ? (
          <span className="text-muted-foreground">Press a shortcut…</span>
        ) : parts.length ? (
          parts.map((p, i) => <Kbd key={i}>{prettyKey(p)}</Kbd>)
        ) : (
          <span className="text-muted-foreground">Not set</span>
        )}
      </button>
      {value !== defaultValue && (
        <Button variant="ghost" size="sm" onClick={() => onChange(defaultValue)}>
          Reset
        </Button>
      )}
    </div>
  )
}
