import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { api } from "@/lib/ipc"
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

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-[4px] bg-white/[0.12] px-1.5 font-small text-[11px] font-medium text-white/85 shadow-[inset_0_-1px_0_rgb(255_255_255/0.08)]">
      {children}
    </kbd>
  )
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

  // Pause the current global shortcut while recording, so pressing it doesn't close the island.
  useEffect(() => {
    if (!recording) return
    api.suspendShortcut(true).catch(() => {})
    return () => {
      api.suspendShortcut(false).catch(() => {})
    }
  }, [recording])

  return (
    <div className="flex items-center gap-1.5">
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
        aria-label={recording ? "Press the new shortcut" : "Change shortcut"}
        className={cn(
          "flex h-7 min-w-36 items-center justify-center gap-1 rounded-ctl px-2 text-[12px] ring-1 ring-inset transition-colors outline-none",
          recording ? "bg-white/[0.1] ring-white/40" : "bg-white/[0.06] ring-white/10 hover:bg-white/[0.09]",
        )}
      >
        {recording ? (
          <span className="text-white/55">Press keys</span>
        ) : parts.length ? (
          parts.map((p, i) => <Key key={i}>{prettyKey(p)}</Key>)
        ) : (
          <span className="text-white/45">Not set</span>
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
