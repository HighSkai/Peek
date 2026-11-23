import { CpuIcon, MemoryStickIcon, PauseIcon, PlayIcon, ThermometerIcon } from "lucide-react"
import { Percent, Temperature } from "@/components/animated-number"
import { PeekEyes, type Look } from "@/components/peek-mascot"
import { api } from "@/lib/ipc"
import { clock } from "@/lib/format"
import { useMotion } from "@/lib/motion"
import { useHardware } from "@/lib/store"
import type { MediaState, Settings } from "@/lib/types"
import { useNow } from "./hooks"
import { Artwork, Visualizer } from "./widgets"

// Everything here is laid out at regular density; the island scales it with CSS zoom.

export function CompactIdle({ settings, height, look }: { settings: Settings; height: number; look?: Look | null }) {
  const now = useNow(settings.idleContent === "clock" ? 1000 : 60_000)
  const { level } = useMotion()
  if (settings.idleContent === "eyes") {
    return (
      <div className="absolute inset-0 grid place-items-center">
        <PeekEyes
          size={Math.round(height * 0.48)}
          animate={level !== "off"}
          wander={level === "full"}
          look={look}
        />
      </div>
    )
  }
  if (settings.idleContent === "clock") {
    const { time, suffix } = clock(now, settings.clock24h)
    return (
      <div className="absolute inset-0 grid place-items-center">
        <span className="tabular text-[13px] font-semibold text-white">
          {time}
          {suffix && <span className="ml-1 font-small text-[10.5px] font-medium text-white/55">{suffix}</span>}
        </span>
      </div>
    )
  }
  return null
}

export function CompactStats({ settings }: { settings: Settings }) {
  const snap = useHardware((s) => s.snapshot)
  const ram = snap && snap.memory.total ? (snap.memory.used / snap.memory.total) * 100 : null
  const t = snap?.cpu.temperature ?? snap?.gpus[0]?.temperature ?? null
  const item = (icon: React.ReactNode, value: React.ReactNode, label: string) => (
    <span className="flex items-center gap-1" title={label}>
      {icon}
      <span className="tabular">{value}</span>
    </span>
  )
  return (
    <div className="absolute inset-0 flex items-center justify-center gap-2.5 px-3 font-small text-[11px] font-semibold text-white">
      {item(<CpuIcon className="size-3 text-white/55" />, <Percent value={snap?.cpu.usage} />, "CPU")}
      {item(<MemoryStickIcon className="size-3 text-white/55" />, <Percent value={ram} />, "Memory")}
      {t != null &&
        item(<ThermometerIcon className="size-3 text-white/55" />, <Temperature celsius={t} unit={settings.temperatureUnit} />, "Temperature")}
    </div>
  )
}

export function CompactActivity({ media, settings, height }: { media: MediaState; settings: Settings; height: number }) {
  const art = Math.round(height - 10)
  return (
    <div className="absolute inset-0 flex items-center justify-between" style={{ paddingInline: (height - art) / 2 + 1 }}>
      <Artwork src={media.artwork} rounded="rounded-[6px]" style={{ width: art, height: art }} />
      <div className="pr-1.5">
        <Visualizer playing={media.playing} mode={settings.visualizer} height={Math.round(height * 0.4)} barWidth={2.5} />
      </div>
    </div>
  )
}

export function Banner({ media, settings }: { media: MediaState; settings: Settings }) {
  return (
    <div className="absolute inset-0 flex items-center gap-2.5 px-2.5">
      <Artwork src={media.artwork} className="size-[42px]" rounded="rounded-[10px]" />
      <div className="min-w-0 flex-1">
        <div className="font-small text-[10.5px] text-white/50">{media.playing ? "Now playing" : "Paused"}</div>
        <div className="truncate text-[13px] font-semibold leading-tight text-white">{media.title}</div>
        <div className="truncate text-[11.5px] text-white/60">{media.artist}</div>
      </div>
      <div className="flex items-center gap-2">
        <Visualizer playing={media.playing} mode={settings.visualizer} height={16} barWidth={2.5} />
        <button
          data-no-drag
          className="grid size-7 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            api.mediaCommand("playPause")
          }}
          aria-label={media.playing ? "Pause" : "Play"}
        >
          {media.playing ? <PauseIcon className="size-3.5 fill-current" /> : <PlayIcon className="size-3.5 fill-current" />}
        </button>
      </div>
    </div>
  )
}
