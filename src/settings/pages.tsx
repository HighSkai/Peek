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
import { ShortcutRecorder } from "./ShortcutRecorder"
import { Group, Page, Row, SliderValue } from "./ui"

export interface PageProps {
  s: Settings
  set: (patch: Partial<Settings>) => void
}

function Choice<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      value={value}
      onValueChange={(v) => v && onChange(v as T)}
      className="bg-background/50"
    >
      {options.map((o) => (
        <ToggleGroupItem key={o.value} value={o.value} className="px-3 text-[13px]">
          {o.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

function Pick<T extends string>({
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
      <SelectTrigger className={cn("w-48 bg-background/50", className)}>
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
      <div className="flex w-64 items-center gap-3">
        <Slider
          value={[local]}
          min={min}
          max={max}
          step={step}
          onValueChange={([v]) => setLocal(v)}
          onValueCommit={([v]) => onChange(v)}
        />
        <SliderValue>{format(local)}</SliderValue>
      </div>
    </Row>
  )
}

// ---------------------------------------------------------------------------

export function GeneralPage({ s, set }: PageProps) {
  const [error, setError] = useState<string | null>(null)
  return (
    <Page title="General" description="Startup, behavior and the keyboard shortcut.">
      <Group title="Startup">
        <Row label="Launch Peek when you sign in" description="Starts quietly in the background with Windows.">
          <Switch checked={s.launchAtLogin} onCheckedChange={(v) => set({ launchAtLogin: v })} />
        </Row>
        <Row label="Show the island on launch" description="Turn off to start hidden; open it from the tray or the shortcut.">
          <Switch checked={s.showOnStartup} onCheckedChange={(v) => set({ showOnStartup: v })} />
        </Row>
      </Group>

      <Group title="Behavior">
        <Row label="Hide during fullscreen apps" description="Games, videos and presentations get the whole screen.">
          <Switch checked={s.hideInFullscreen} onCheckedChange={(v) => set({ hideInFullscreen: v })} />
        </Row>
        <Row label="Close when clicking elsewhere" description="Collapse the dashboard when another window gets focus.">
          <Switch checked={s.collapseOnBlur} onCheckedChange={(v) => set({ collapseOnBlur: v })} />
        </Row>
        <Row label="Open on hover" description="Expand the dashboard when the pointer rests on the island.">
          <Switch checked={s.expandOnHover} onCheckedChange={(v) => set({ expandOnHover: v })} />
        </Row>
        {s.expandOnHover && (
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
        <Row label="Open to" description="The section shown when the dashboard opens.">
          <Pick
            value={s.defaultTab}
            onChange={(v) => set({ defaultTab: v })}
            options={[
              { value: "home", label: "Home" },
              { value: "media", label: "Now Playing" },
              { value: "system", label: "System" },
              { value: "ask", label: "Ask" },
            ]}
          />
        </Row>
      </Group>

      <Group
        title="Keyboard"
        footer={error ?? "Opens the dashboard with the search bar focused. Press Backspace while recording to clear it."}
      >
        <Row label="Global shortcut">
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

      <Group title="Reset">
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
        "group flex flex-1 flex-col items-center gap-2.5 rounded-xl border p-3 text-sm transition",
        selected ? "border-foreground/60 bg-accent ring-2 ring-foreground/15" : "hover:bg-accent/60",
      )}
    >
      <div className="relative h-16 w-full overflow-hidden rounded-lg bg-gradient-to-b from-neutral-300 to-neutral-200 dark:from-neutral-700 dark:to-neutral-800">
        <div
          className={cn(
            "absolute left-1/2 grid h-5 w-20 -translate-x-1/2 place-items-center bg-black",
            notch ? "top-0 rounded-b-lg" : "top-2 rounded-full",
          )}
        >
          <PeekEyes size={0.5} animate={false} />
        </div>
      </div>
      <span className="font-medium">{label}</span>
    </button>
  )
}

export function AppearancePage({ s, set }: PageProps) {
  return (
    <Page title="Appearance" description="How the island looks at rest and when it opens.">
      <Group title="Style">
        <div className="flex gap-3 p-4">
          <ModeCard label="Dynamic Island" notch={false} selected={s.mode === "island"} onClick={() => set({ mode: "island" })} />
          <ModeCard label="Notch" notch selected={s.mode === "notch"} onClick={() => set({ mode: "notch" })} />
        </div>
        <Row label="Surface" description="Solid black blends in like hardware; glass lets the desktop show through.">
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
        <Row label="Island">
          <Choice
            value={s.islandSize}
            onChange={(v) => set({ islandSize: v })}
            options={[
              { value: "small", label: "Small" },
              { value: "medium", label: "Medium" },
              { value: "large", label: "Large" },
            ]}
          />
        </Row>
        <Row label="Dashboard">
          <Choice
            value={s.dashboardSize}
            onChange={(v) => set({ dashboardSize: v })}
            options={[
              { value: "small", label: "Small" },
              { value: "medium", label: "Medium" },
              { value: "large", label: "Large" },
            ]}
          />
        </Row>
      </Group>

      <Group title="At rest">
        <Row label="Show in the island" description="What the island shows when nothing else is going on.">
          <Pick
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
        <Row label="Announce new tracks" description="Briefly expand to show the next song.">
          <Switch checked={s.mediaToast} onCheckedChange={(v) => set({ mediaToast: v })} />
        </Row>
        <Row label="Visualizer">
          <Pick
            value={s.visualizer}
            onChange={(v) => set({ visualizer: v })}
            options={[
              { value: "audio", label: "Reacts to audio" },
              { value: "animated", label: "Animated" },
              { value: "off", label: "Off" },
            ]}
          />
        </Row>
      </Group>

      <Group title="Settings window">
        <Row label="Theme">
          <Choice
            value={s.theme}
            onChange={(v) => set({ theme: v })}
            options={[
              { value: "system", label: "System" },
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
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
    <Page title="Position" description="Where the island sits on your screen.">
      <Group title="Display">
        <Row label="Show on">
          <Pick
            className="w-56"
            value={s.monitor || "__primary"}
            onChange={(v) => set({ monitor: v === "__primary" ? "" : v })}
            options={[{ value: "__primary", label: "Primary display" }, ...monitors.map((m) => ({ value: m, label: label(m) }))]}
          />
        </Row>
      </Group>
      <Group title="Placement" footer="The island stays centered at the top of the display; nudge it if it covers something you use.">
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

function AnimationPreview({ s }: { s: Settings }) {
  const [open, setOpen] = useState(false)
  const transition = s.animations
    ? { type: "spring" as const, visualDuration: 0.5 / s.animationSpeed, bounce: s.bounce }
    : { duration: 0 }
  return (
    <div className="flex h-44 flex-col items-center rounded-lg bg-gradient-to-b from-neutral-300 to-neutral-200 p-3 dark:from-neutral-800 dark:to-neutral-900">
      <motion.button
        onClick={() => setOpen((o) => !o)}
        className="grid place-items-center overflow-hidden bg-black text-[11px] font-medium text-white/70"
        initial={false}
        animate={{ width: open ? 300 : 120, height: open ? 130 : 28, borderRadius: open ? 26 : 14 }}
        transition={transition}
      >
        {open ? "Click to close" : <PeekEyes size={0.7} animate={false} />}
      </motion.button>
      {!open && <span className="mt-auto text-xs text-muted-foreground">Click the island to preview</span>}
    </div>
  )
}

export function AnimationsPage({ s, set }: PageProps) {
  return (
    <Page title="Animations" description="Spring physics for every expand and collapse.">
      <Group>
        <div className="p-4">
          <AnimationPreview s={s} />
        </div>
        <Row label="Animations" description="Turn off for instant transitions.">
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
    <Page title="Features" description="Turn off anything you don't use. Disabled features stop running in the background.">
      <Group title="Media">
        <Row label="Media controls" description="Now playing, album art and playback controls for any app that reports media to Windows.">
          <Switch checked={s.featureMedia} onCheckedChange={(v) => set({ featureMedia: v })} />
        </Row>
      </Group>

      <Group
        title="Hardware"
        footer={
          <>
            CPU, GPU, memory, disks and network work out of the box. NVIDIA GPUs report temperature, fan and power directly.
            For CPU temperatures and fan speeds, run{" "}
            <button
              className="underline underline-offset-2"
              onClick={() => api.openUrl("https://github.com/LibreHardwareMonitor/LibreHardwareMonitor/releases")}
            >
              LibreHardwareMonitor
            </button>{" "}
            (or OpenHardwareMonitor) in the background; Peek reads its sensors automatically.
          </>
        }
      >
        <Row label="Hardware monitor" description="Only samples while the dashboard is open or live stats are shown.">
          <Switch checked={s.featureHardware} onCheckedChange={(v) => set({ featureHardware: v })} />
        </Row>
        <Row label="Refresh every">
          <Pick
            className="w-32"
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
        <Row label="AI assistant" description="The Ask tab and AI answers from the search bar. Web search keeps working when this is off.">
          <Switch checked={s.featureAi} onCheckedChange={(v) => set({ featureAi: v })} />
        </Row>
      </Group>
    </Page>
  )
}
