import { CpuIcon, MemoryStickIcon, PauseIcon, PlayIcon, ThermometerIcon } from "lucide-react"
import { PeekEyes } from "@/components/peek-mascot"
import { api } from "@/lib/ipc"
import { clock, temp } from "@/lib/format"
import { useHardware } from "@/lib/store"
import type { MediaState, Settings } from "@/lib/types"
import { useNow } from "./hooks"
import { Artwork, Visualizer } from "./widgets"

export function CompactIdle({ settings, height }: { settings: Settings; height: number }) {
  const now = useNow(settings.idleContent === "clock" ? 1000 : 60_000)
  if (settings.idleContent === "eyes") {
    return (
      <div className="absolute inset-0 grid place-items-center">
        <PeekEyes size={height / 34} animate={settings.animations} />
      </div>
    )
  }
  if (settings.idleContent === "clock") {
    const { time, suffix } = clock(now, settings.clock24h)
    return (
      <div className="absolute inset-0 grid place-items-center">
        <span className="tabular text-[13px] font-semibold tracking-tight text-white">
          {time}
          {suffix && <span className="ml-1 text-[10px] font-medium text-white/55">{suffix}</span>}
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
  const item = (icon: React.ReactNode, value: string) => (
    <span className="flex items-center gap-1">
      {icon}
      <span className="tabular">{value}</span>
    </span>
  )
  return (
    <div className="absolute inset-0 flex items-center justify-center gap-3 px-4 text-[11.5px] font-semibold text-white">
      {item(<CpuIcon className="size-3.5 text-white/55" />, snap ? `${Math.round(snap.cpu.usage)}%` : "—")}
      {item(<MemoryStickIcon className="size-3.5 text-white/55" />, ram != null ? `${Math.round(ram)}%` : "—")}
      {t != null && item(<ThermometerIcon className="size-3.5 text-white/55" />, temp(t, settings.temperatureUnit))}
    </div>
  )
}

export function CompactActivity({ media, settings, height }: { media: MediaState; settings: Settings; height: number }) {
  const art = Math.round(height - 12)
  return (
    <div className="absolute inset-0 flex items-center justify-between" style={{ paddingInline: (height - art) / 2 + 2 }}>
      <Artwork src={media.artwork} className="shadow-sm" rounded="rounded-[7px]" {...sizeProps(art)} />
      <div className="pr-1.5">
        <Visualizer playing={media.playing} mode={settings.visualizer} height={Math.round(height * 0.42)} />
      </div>
    </div>
  )
}

export function Banner({ media, settings }: { media: MediaState; settings: Settings }) {
  return (
    <div className="absolute inset-0 flex items-center gap-3 px-3.5">
      <Artwork src={media.artwork} className="size-[50px] shadow-lg shadow-black/40" rounded="rounded-[14px]" />
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-medium text-white/50">{media.playing ? "Now playing" : "Paused"}</div>
        <div className="truncate text-[14px] font-semibold leading-tight text-white">{media.title}</div>
        <div className="truncate text-[12.5px] text-white/60">{media.artist}</div>
      </div>
      <div className="flex items-center gap-2.5">
        <Visualizer playing={media.playing} mode={settings.visualizer} height={18} barWidth={3} />
        <button
          className="grid size-8 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            api.mediaCommand("playPause")
          }}
          aria-label={media.playing ? "Pause" : "Play"}
        >
          {media.playing ? <PauseIcon className="size-4 fill-current" /> : <PlayIcon className="size-4 fill-current" />}
        </button>
      </div>
    </div>
  )
}

function sizeProps(px: number) {
  return { style: { width: px, height: px } } as const
}
