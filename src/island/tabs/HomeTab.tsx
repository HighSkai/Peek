import { ArrowDownIcon, CpuIcon, GpuIcon, MemoryStickIcon, MusicIcon, ThermometerIcon } from "lucide-react"
import { AnimatedNumber, ClockDigits, Percent, Temperature } from "@/components/animated-number"
import { clock, longDate, rate } from "@/lib/format"
import { HOME_ROWS } from "@/lib/layout"
import { useHardware, useIslandUi, useMedia } from "@/lib/store"
import type { MediaState, Settings } from "@/lib/types"
import { cn } from "@/lib/utils"
import { useMediaPosition, useNow } from "../hooks"
import { AmbientArt, Artwork, Sparkline, Visualizer } from "../widgets"
import { AskBar, Card, Transport } from "./parts"

/**
 * Home: three short rows. What's playing next to the time, live stats, then search.
 * Row heights come from HOME_ROWS so the island opens exactly as tall as Home needs.
 */
export function HomeTab({ settings, searchNonce }: { settings: Settings; searchNonce: number }) {
  return (
    <div className="flex h-full flex-col pt-0.5" style={{ gap: HOME_ROWS.gap }}>
      <div className="flex shrink-0" style={{ height: HOME_ROWS.top, gap: HOME_ROWS.gap }}>
        {settings.featureMedia && <NowPlayingStrip settings={settings} />}
        <ClockTile settings={settings} wide={!settings.featureMedia} />
      </div>
      {settings.featureHardware && <StatsRow settings={settings} />}
      <AskBar settings={settings} focusNonce={searchNonce} />
    </div>
  )
}

function NowPlayingStrip({ settings }: { settings: Settings }) {
  const media = useMedia((s) => s.media)
  const setTab = useIslandUi((s) => s.setTab)

  if (!media?.available) {
    return (
      <Card className="flex min-w-0 flex-1 items-center gap-3 px-3">
        <div className="grid size-[58px] shrink-0 place-items-center rounded-[9px] bg-white/[0.06] text-white/40">
          <MusicIcon className="size-5" />
        </div>
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-white/85">Nothing playing</div>
          <div className="truncate text-[12px] text-white/50">Play something in any app and it shows up here.</div>
        </div>
      </Card>
    )
  }

  return (
    <Card className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-2.5 pr-2">
      <AmbientArt src={media.artwork} opacity={0.35} />
      <button
        className="relative flex min-w-0 flex-1 items-center gap-3 text-left"
        onClick={() => setTab("media")}
        title="Open Music"
      >
        <Artwork src={media.artwork} style={{ width: 62, height: 62 }} rounded="rounded-[9px]" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[13.5px] font-semibold leading-tight">{media.title || "Unknown title"}</span>
            <Visualizer playing={media.playing} mode={settings.visualizer} height={11} barWidth={2} bars={4} />
          </div>
          <div className="truncate text-[12px] leading-snug text-white/60">{media.artist || media.appName}</div>
          <MiniProgress media={media} />
        </div>
      </button>
      <div className="relative shrink-0">
        <Transport media={media} />
      </div>
    </Card>
  )
}

/** A thin, read-only progress line with the elapsed time. */
function MiniProgress({ media }: { media: MediaState }) {
  const pos = useMediaPosition(media)
  if (!media.durationMs) return null
  const pct = Math.min(100, (pos / media.durationMs) * 100)
  return (
    <div className="mt-1.5 flex items-center gap-2">
      <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/15">
        <div className="h-full rounded-full bg-white/85" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function ClockTile({ settings, wide }: { settings: Settings; wide: boolean }) {
  const now = useNow(1000)
  const { suffix } = clock(now, settings.clock24h)
  return (
    <Card className={cn("flex flex-col justify-center", wide ? "flex-1 px-4" : "w-[168px] shrink-0 px-3.5")}>
      <div className="flex items-baseline gap-1">
        <ClockDigits
          date={now}
          h24={settings.clock24h}
          className={cn("tabular font-display font-semibold leading-none", wide ? "text-[36px]" : "text-[30px]")}
        />
        {suffix && <span className="font-small text-[11px] font-medium text-white/50">{suffix}</span>}
      </div>
      <div className="mt-1 truncate text-[12px] text-white/55">{longDate(now)}</div>
    </Card>
  )
}

function StatsRow({ settings }: { settings: Settings }) {
  const snap = useHardware((s) => s.snapshot)
  const history = useHardware((s) => s.history)
  const setTab = useIslandUi((s) => s.setTab)
  const gpu = snap?.gpus[0]
  const ram = snap && snap.memory.total ? (snap.memory.used / snap.memory.total) * 100 : null
  const t = snap?.cpu.temperature ?? gpu?.temperature ?? null

  return (
    <div className="grid shrink-0 grid-cols-4" style={{ height: HOME_ROWS.stats, gap: HOME_ROWS.gap }}>
      <Tile label="CPU" icon={<CpuIcon className="size-3" />} series={history.cpu} max={100} onOpen={() => setTab("system")}>
        <Percent value={snap?.cpu.usage} />
      </Tile>
      <Tile label="GPU" icon={<GpuIcon className="size-3" />} series={history.gpu} max={100} onOpen={() => setTab("system")}>
        <Percent value={gpu?.usage} />
      </Tile>
      <Tile label="Memory" icon={<MemoryStickIcon className="size-3" />} series={history.ram} max={100} onOpen={() => setTab("system")}>
        <Percent value={ram} />
      </Tile>
      {t != null ? (
        <Tile
          label={snap?.cpu.temperature != null ? "CPU temp" : "GPU temp"}
          icon={<ThermometerIcon className="size-3" />}
          onOpen={() => setTab("system")}
        >
          <Temperature celsius={t} unit={settings.temperatureUnit} />
        </Tile>
      ) : (
        <Tile label="Download" icon={<ArrowDownIcon className="size-3" />} series={history.rx} onOpen={() => setTab("system")} small>
          {snap ? rate(snap.network.rxBps) : <AnimatedNumber value={null} />}
        </Tile>
      )}
    </div>
  )
}

function Tile({
  label,
  icon,
  children,
  series,
  max,
  small,
  onOpen,
}: {
  label: string
  icon: React.ReactNode
  children: React.ReactNode
  series?: number[]
  max?: number
  small?: boolean
  onOpen: () => void
}) {
  return (
    <button onClick={onOpen} className="text-left" title={`${label}: open System`}>
      <Card className="flex h-full flex-col justify-between px-3 py-2 transition-colors hover:bg-white/[0.08]">
        <div className="relative z-10 flex items-center justify-between font-small text-[11px] text-white/55">
          {label}
          <span className="text-white/35">{icon}</span>
        </div>
        <div
          className={cn(
            "tabular relative z-10",
            small ? "text-[13px] font-semibold" : "font-display text-[19px] font-semibold leading-none",
          )}
        >
          {children}
        </div>
        {series && <Sparkline values={series} max={max} className="pointer-events-none absolute inset-x-0 bottom-0 h-6 opacity-40" />}
      </Card>
    </button>
  )
}
