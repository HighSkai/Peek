import { useEffect, useState } from "react"
import { motion } from "motion/react"
import { RotateCcwIcon } from "lucide-react"
import { PeekEyes } from "@/components/peek-mascot"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { api } from "@/lib/ipc"
import type { Settings } from "@/lib/types"
import { cn } from "@/lib/utils"
import { prettyKey, ShortcutRecorder } from "./ShortcutRecorder"
import { Group, Page, Row, SliderValue } from "./ui"

export interface PageProps {
  s: Settings
  set: (patch: Partial<Settings>) => void
}

export function Choice<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}) {
  return (
    <ToggleGroup type="single" value={value} onValueChange={(v) => v && onChange(v as T)}>
      {options.map((o) => (
        <ToggleGroupItem key={o.value} value={o.value}>
          {o.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

export function Pick<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
  className?: string
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as T)}>
      <SelectTrigger size="sm" className={cn("w-40", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function RangeRow({
  label,
  description,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string
  description?: string
  value: number
  min: number
  max: number
  step: number
  format: (v: number) => string
  onChange: (v: number) => void
}) {
  const [local, setLocal] = useState(value)
  useEffect(() => setLocal(value), [value])
  return (
    <Row label={label} description={description}>
      <div className="flex w-48 items-center gap-2.5">
        <Slider
          value={[local]}
          min={min}
          max={max}
          step={step}
          onValueChange={([v]) => setLocal(v)}
          onValueCommit={([v]) => onChange(v)}
          aria-label={label}
        />
        <SliderValue>{format(local)}</SliderValue>
      </div>
    </Row>
  )
}

const SIZES = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
] as const

// ---------------------------------------------------------------------------

export function GeneralPage({ s, set }: PageProps) {
  const [error, setError] = useState<string | null>(null)
  const hotkey = s.reveal === "hotkey"
  const keys = s.shortcut ? s.shortcut.split("+").map(prettyKey).join(" + ") : null
  return (
    <Page>
      <Group
        title="Island"
        footer={
          error ??
          (hotkey && !s.shortcut
            ? "Set a shortcut, or open Peek from its tray icon."
            : "Press Backspace while recording to clear the shortcut.")
        }
      >
        <Row
          label="Show the island"
          description={
            hotkey
              ? `Hidden until you press ${keys ?? "the shortcut"} or click the tray icon.`
              : "Rests at the top of the screen."
          }
        >
          <Choice
            value={s.reveal}
            onChange={(v) => set({ reveal: v })}
            options={[
              { value: "always", label: "Always" },
              { value: "hotkey", label: "On shortcut" },
            ]}
          />
        </Row>
        <Row label="Shortcut" description="Opens and closes the dashboard.">
          <ShortcutRecorder
            value={s.shortcut}
            defaultValue="Alt+Shift+Space"
            onChange={async (v) => {
              setError(null)
              try {
                await api.updateSettings({ shortcut: v })
              } catch (e) {
                setError(String(e))
              }
            }}
          />
        </Row>
      </Group>

      <Group title="Startup">
        <Row label="Start with Windows" description="Runs quietly in the background after you sign in.">
          <Switch checked={s.launchAtLogin} onCheckedChange={(v) => set({ launchAtLogin: v })} />
        </Row>
        {!hotkey && (
          <Row label="Show the island on launch" description="Turn off to start hidden.">
            <Switch checked={s.showOnStartup} onCheckedChange={(v) => set({ showOnStartup: v })} />
          </Row>
        )}
      </Group>

      <Group title="Behavior">
        <Row label="Hide during fullscreen apps" description="Games, videos and presentations get the whole screen.">
          <Switch checked={s.hideInFullscreen} onCheckedChange={(v) => set({ hideInFullscreen: v })} />
        </Row>
        <Row label="Close when clicking elsewhere">
          <Switch checked={s.collapseOnBlur} onCheckedChange={(v) => set({ collapseOnBlur: v })} />
        </Row>
        {!hotkey && (
          <Row label="Open on hover" description="Opens when the pointer rests on the island.">
            <Switch checked={s.expandOnHover} onCheckedChange={(v) => set({ expandOnHover: v })} />
          </Row>
        )}
        {!hotkey && s.expandOnHover && (
          <RangeRow
            label="Hover delay"
            value={s.hoverDelayMs}
            min={0}
            max={1500}
            step={50}
            format={(v) => `${v} ms`}
            onChange={(v) => set({ hoverDelayMs: v })}
          />
        )}
        <Row label="Open to">
          <Pick
            className="w-32"
            value={s.defaultTab === "settings" ? "home" : s.defaultTab}
            onChange={(v) => set({ defaultTab: v })}
            options={[
              { value: "home", label: "Home" },
              { value: "media", label: "Now playing" },
              { value: "system", label: "System" },
              { value: "ask", label: "Ask" },
            ]}
          />
        </Row>
      </Group>

      <Group>
        <Row label="Restore default settings" description="API keys stay in Windows Credential Manager.">
          <Button variant="outline" size="sm" onClick={() => api.resetSettings()}>
            <RotateCcwIcon /> Reset
          </Button>
        </Row>
      </Group>
    </Page>
  )
}

// ---------------------------------------------------------------------------

function ModeCard({ selected, onClick, notch, label }: { selected: boolean; onClick: () => void; notch: boolean; label: string }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "flex flex-1 flex-col items-center gap-1.5 rounded-ctl p-1.5 text-[12px] ring-1 ring-inset transition-colors",
        selected ? "bg-white/[0.08] ring-white/50" : "ring-white/10 hover:bg-white/[0.05]",
      )}
    >
      <div className="relative h-11 w-full overflow-hidden rounded-[5px] bg-gradient-to-b from-neutral-600 to-neutral-800">
        <div
          className={cn(
            "absolute left-1/2 grid h-4 w-16 -translate-x-1/2 place-items-center bg-black",
            notch ? "top-0 rounded-b-[6px]" : "top-1.5 rounded-full",
          )}
        >
          <PeekEyes size={8} animate={false} />
        </div>
      </div>
      <span className={selected ? "font-medium text-white" : "text-white/70"}>{label}</span>
    </button>
  )
}

export function AppearancePage({ s, set }: PageProps) {
  return (
    <Page>
      <Group title="Style">
        <div className="flex gap-2 p-2">
          <ModeCard label="Dynamic Island" notch={false} selected={s.mode === "island"} onClick={() => set({ mode: "island" })} />
          <ModeCard label="Notch" notch selected={s.mode === "notch"} onClick={() => set({ mode: "notch" })} />
        </div>
        <Row label="Surface" description="Solid black looks like hardware. Glass lets the desktop show through.">
          <Choice
            value={s.style}
            onChange={(v) => set({ style: v })}
            options={[
              { value: "solid", label: "Solid" },
              { value: "glass", label: "Glass" },
            ]}
          />
        </Row>
        {s.style === "glass" && (
          <RangeRow
            label="Glass opacity"
            value={Math.round(s.glassOpacity * 100)}
            min={35}
            max={100}
            step={1}
            format={(v) => `${v}%`}
            onChange={(v) => set({ glassOpacity: v / 100 })}
          />
        )}
      </Group>

      <Group title="Size">
        <Row label="Density" description="Compact draws the island and dashboard about 14% smaller.">
          <Choice
            value={s.density}
            onChange={(v) => set({ density: v })}
            options={[
              { value: "regular", label: "Regular" },
              { value: "compact", label: "Compact" },
            ]}
          />
        </Row>
        <Row label="Island">
          <Choice value={s.islandSize} onChange={(v) => set({ islandSize: v })} options={[...SIZES]} />
        </Row>
        <Row label="Dashboard">
          <Choice value={s.dashboardSize} onChange={(v) => set({ dashboardSize: v })} options={[...SIZES]} />
        </Row>
      </Group>

      <Group title="At rest">
        <Row label="Show in the island" description="When nothing else is going on.">
          <Pick
            className="w-36"
            value={s.idleContent}
            onChange={(v) => set({ idleContent: v })}
            options={[
              { value: "eyes", label: "Peek's eyes" },
              { value: "clock", label: "Clock" },
              { value: "stats", label: "Live system stats" },
              { value: "none", label: "Nothing" },
            ]}
          />
        </Row>
        <Row label="24-hour clock">
          <Switch checked={s.clock24h} onCheckedChange={(v) => set({ clock24h: v })} />
        </Row>
      </Group>

      <Group title="Now playing">
        <Row label="Show music in the island" description="Album art and a visualizer while something plays.">
          <Switch checked={s.showMediaActivity} onCheckedChange={(v) => set({ showMediaActivity: v })} />
        </Row>
        <Row label="Announce new tracks" description="Briefly shows the next song.">
          <Switch checked={s.mediaToast} onCheckedChange={(v) => set({ mediaToast: v })} />
        </Row>
        <Row label="Visualizer">
          <Pick
            className="w-36"
            value={s.visualizer}
            onChange={(v) => set({ visualizer: v })}
            options={[
              { value: "audio", label: "Follows the audio" },
              { value: "animated", label: "Animated" },
              { value: "off", label: "Off" },
            ]}
          />
        </Row>
      </Group>
    </Page>
  )
}

// ---------------------------------------------------------------------------

export function PositionPage({ s, set }: PageProps) {
  const [monitors, setMonitors] = useState<string[]>([])
  useEffect(() => {
    api.listMonitors().then(setMonitors).catch(() => setMonitors([]))
  }, [])
  const label = (name: string) => name.replace(/^\\\\\.\\/, "").replace(/^DISPLAY/, "Display ")
  return (
    <Page>
      <Group title="Display">
        <Row label="Show on">
          <Pick
            className="w-44"
            value={s.monitor || "__primary"}
            onChange={(v) => set({ monitor: v === "__primary" ? "" : v })}
            options={[{ value: "__primary", label: "Primary display" }, ...monitors.map((m) => ({ value: m, label: label(m) }))]}
          />
        </Row>
      </Group>
      <Group title="Placement" footer="The island stays centered at the top of the display. Nudge it if it covers something you use.">
        <RangeRow
          label="Horizontal offset"
          value={s.offsetX}
          min={-800}
          max={800}
          step={2}
          format={(v) => `${v > 0 ? "+" : ""}${v} px`}
          onChange={(v) => set({ offsetX: v })}
        />
        {s.mode === "island" && (
          <RangeRow
            label="Distance from top"
            value={s.offsetY}
            min={0}
            max={60}
            step={1}
            format={(v) => `${v} px`}
            onChange={(v) => set({ offsetY: v })}
          />
        )}
        {(s.offsetX !== 0 || (s.mode === "island" && s.offsetY !== 10)) && (
          <Row label="Back to center">
            <Button variant="outline" size="sm" onClick={() => set({ offsetX: 0, offsetY: 10 })}>
              <RotateCcwIcon /> Reset
            </Button>
          </Row>
        )}
      </Group>
    </Page>
  )
}

// ---------------------------------------------------------------------------

function MotionPreview({ s }: { s: Settings }) {
  const [open, setOpen] = useState(false)
  const speed = s.animationSpeed || 1
  const transition = s.animations
    ? {
        type: "spring" as const,
        visualDuration: (open ? 0.46 : 0.4) / speed,
        bounce: open ? s.bounce : s.bounce * 0.6,
      }
    : { duration: 0 }
  return (
    <div className="flex h-28 flex-col items-center rounded-ctl bg-gradient-to-b from-neutral-700 to-neutral-900 p-2">
      <motion.button
        onClick={() => setOpen((o) => !o)}
        className="grid place-items-center overflow-hidden bg-black text-[11px] text-white/60"
        initial={false}
        animate={{ width: open ? 240 : 100, height: open ? 88 : 22, borderRadius: open ? 20 : 11 }}
        transition={transition}
        aria-label={open ? "Close the preview" : "Open the preview"}
      >
        {open ? "Click to close" : <PeekEyes size={10} animate={false} />}
      </motion.button>
      {!open && <span className="mt-auto text-[11px] text-white/45">Click the island to try it</span>}
    </div>
  )
}

export function MotionPage({ s, set }: PageProps) {
  return (
    <Page>
      <Group footer="Drag the island down to open it and push it back up to close. A quick flick finishes the motion; a slow drag can be put back.">
        <div className="p-2">
          <MotionPreview s={s} />
        </div>
        <Row label="Animations" description="Turn off for instant changes.">
          <Switch checked={s.animations} onCheckedChange={(v) => set({ animations: v })} />
        </Row>
        {s.animations && (
          <>
            <RangeRow
              label="Speed"
              value={s.animationSpeed}
              min={0.5}
              max={2}
              step={0.05}
              format={(v) => `${v.toFixed(2)}×`}
              onChange={(v) => set({ animationSpeed: v })}
            />
            <RangeRow
              label="Bounce"
              value={s.bounce}
              min={0}
              max={0.6}
              step={0.01}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(v) => set({ bounce: v })}
            />
            <Row label="Grow on hover" description="The island swells slightly under the pointer.">
              <Switch checked={s.hoverEffect} onCheckedChange={(v) => set({ hoverEffect: v })} />
            </Row>
          </>
        )}
      </Group>
    </Page>
  )
}

// ---------------------------------------------------------------------------

export function FeaturesPage({ s, set }: PageProps) {
  return (
    <Page>
      <Group title="Media">
        <Row label="Media controls" description="Now playing and playback controls for any app that reports media to Windows.">
          <Switch checked={s.featureMedia} onCheckedChange={(v) => set({ featureMedia: v })} />
        </Row>
      </Group>

      <Group
        title="Hardware"
        footer={
          <>
            CPU, GPU, memory, disks and network work out of the box. For CPU temperatures and fan speeds, run{" "}
            <button
              className="underline underline-offset-2"
              onClick={() => api.openUrl("https://github.com/LibreHardwareMonitor/LibreHardwareMonitor/releases")}
            >
              LibreHardwareMonitor
            </button>{" "}
            in the background.
          </>
        }
      >
        <Row label="Hardware monitor" description="Only samples while the dashboard is open or live stats are shown.">
          <Switch checked={s.featureHardware} onCheckedChange={(v) => set({ featureHardware: v })} />
        </Row>
        <Row label="Refresh every">
          <Pick
            className="w-28"
            value={String(s.hardwareIntervalMs)}
            onChange={(v) => set({ hardwareIntervalMs: Number(v) })}
            options={[
              { value: "500", label: "0.5 seconds" },
              { value: "1000", label: "1 second" },
              { value: "2000", label: "2 seconds" },
              { value: "5000", label: "5 seconds" },
            ]}
          />
        </Row>
        <Row label="Temperature unit">
          <Choice
            value={s.temperatureUnit}
            onChange={(v) => set({ temperatureUnit: v })}
            options={[
              { value: "c", label: "°C" },
              { value: "f", label: "°F" },
            ]}
          />
        </Row>
      </Group>

      <Group title="Assistant">
        <Row label="AI assistant" description="The Ask tab and AI answers from the search bar. Web search works without it.">
          <Switch checked={s.featureAi} onCheckedChange={(v) => set({ featureAi: v })} />
        </Row>
      </Group>
    </Page>
  )
}
