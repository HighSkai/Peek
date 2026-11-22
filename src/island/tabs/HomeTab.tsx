import { ArrowDownIcon, CpuIcon, GpuIcon, MemoryStickIcon, ThermometerIcon } from "lucide-react"
import { clock, longDate, pct, rate, temp } from "@/lib/format"
import { useHardware, useMedia } from "@/lib/store"
import type { Settings, Tab } from "@/lib/types"
import { DASHBOARD } from "@/lib/layout"
import { useNow } from "../hooks"
import { Sparkline } from "../widgets"
import { AskBar, Card, NowPlayingCard } from "./parts"

export function HomeTab({
  settings,
  setTab,
  searchNonce,
}: {
  settings: Settings
  setTab: (t: Tab) => void
  searchNonce: number
}) {
  const media = useMedia((s) => s.media)
  const side = DASHBOARD[settings.dashboardSize].w >= 700 ? 236 : 208
  return (
    <div className="flex h-full flex-col gap-2.5 p-2.5">
      <div className="flex min-h-0 flex-1 gap-2.5">
        <div className="min-w-0 flex-1">
          {settings.featureMedia ? (
            <NowPlayingCard media={media} settings={settings} />
          ) : (
            <ClockCard settings={settings} large />
          )}
        </div>
        <div className="flex shrink-0 flex-col gap-2.5" style={{ width: side }}>
          {settings.featureMedia && <ClockCard settings={settings} />}
          {settings.featureHardware && <StatsGrid settings={settings} onOpen={() => setTab("system")} />}
        </div>
      </div>
      <AskBar settings={settings} setTab={setTab} focusNonce={searchNonce} />
    </div>
  )
}

function ClockCard({ settings, large = false }: { settings: Settings; large?: boolean }) {
  const now = useNow(1000)
  const { time, suffix } = clock(now, settings.clock24h)
  return (
    <Card className={large ? "flex h-full flex-col justify-center px-6" : "px-4 py-3"}>
      <div className="flex items-baseline gap-1.5">
        <span
          className={
            large
              ? "tabular font-display text-[64px] font-light leading-none tracking-tight"
              : "tabular font-display text-[38px] font-light leading-none tracking-tight"
          }
        >
          {time}
        </span>
        {suffix && <span className="text-[13px] font-medium text-white/50">{suffix}</span>}
      </div>
      <div className="mt-1.5 text-[12.5px] text-white/55">{longDate(now)}</div>
    </Card>
  )
}

function StatsGrid({ settings, onOpen }: { settings: Settings; onOpen: () => void }) {
  const snap = useHardware((s) => s.snapshot)
  const history = useHardware((s) => s.history)
  const gpu = snap?.gpus[0]
  const ram = snap && snap.memory.total ? (snap.memory.used / snap.memory.total) * 100 : null
  const t = snap?.cpu.temperature ?? gpu?.temperature ?? null

  return (
    <button
      onClick={onOpen}
      className="grid min-h-0 flex-1 grid-cols-2 gap-2 text-left"
      title="Open system details"
    >
      <Tile label="CPU" icon={<CpuIcon className="size-3.5" />} value={pct(snap?.cpu.usage)} series={history.cpu} max={100} />
      <Tile
        label="GPU"
        icon={<GpuIcon className="size-3.5" />}
        value={gpu?.usage != null ? pct(gpu.usage) : "—"}
        series={history.gpu}
        max={100}
      />
      <Tile label="Memory" icon={<MemoryStickIcon className="size-3.5" />} value={pct(ram)} series={history.ram} max={100} />
      {t != null ? (
        <Tile
          label={snap?.cpu.temperature != null ? "CPU Temp" : "GPU Temp"}
          icon={<ThermometerIcon className="size-3.5" />}
          value={temp(t, settings.temperatureUnit)}
        />
      ) : (
        <Tile
          label="Download"
          icon={<ArrowDownIcon className="size-3.5" />}
          value={rate(snap?.network.rxBps)}
          series={history.rx}
          small
        />
      )}
    </button>
  )
}

function Tile({
  label,
  icon,
  value,
  series,
  max,
  small,
}: {
  label: string
  icon: React.ReactNode
  value: string
  series?: number[]
  max?: number
  small?: boolean
}) {
  return (
    <Card className="flex min-h-[64px] flex-col gap-1.5 rounded-2xl p-2.5 transition-colors hover:bg-white/[0.07]">
      <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.08em] text-white/45">
        {label}
        <span className="text-white/35">{icon}</span>
      </div>
      <div className={small ? "tabular relative z-10 text-[15px] font-semibold" : "tabular relative z-10 text-[20px] font-semibold leading-none"}>
        {value}
      </div>
      {series && <Sparkline values={series} max={max} className="pointer-events-none absolute inset-x-0 bottom-0 h-6 opacity-60" />}
    </Card>
  )
}
