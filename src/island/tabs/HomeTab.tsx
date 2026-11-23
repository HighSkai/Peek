import { ArrowDownIcon, CpuIcon, GpuIcon, MemoryStickIcon, ThermometerIcon } from "lucide-react"
import { clock, longDate, NONE, pct, rate, temp } from "@/lib/format"
import { DASHBOARD } from "@/lib/layout"
import { useHardware, useIslandUi, useMedia } from "@/lib/store"
import type { Settings } from "@/lib/types"
import { useNow } from "../hooks"
import { Sparkline } from "../widgets"
import { AskBar, Card, NowPlayingCard } from "./parts"

export function HomeTab({ settings, searchNonce }: { settings: Settings; searchNonce: number }) {
  const media = useMedia((s) => s.media)
  const setTab = useIslandUi((s) => s.setTab)
  const side = DASHBOARD[settings.dashboardSize].w >= 600 ? 196 : 176
  return (
    <div className="flex h-full flex-col gap-2 pt-0.5">
      <div className="flex min-h-0 flex-1 gap-2">
        <div className="min-w-0 flex-1">
          {settings.featureMedia ? <NowPlayingCard media={media} settings={settings} /> : <ClockCard settings={settings} large />}
        </div>
        {(settings.featureMedia || settings.featureHardware) && (
          <div className="flex shrink-0 flex-col gap-2" style={{ width: side }}>
            {settings.featureMedia && <ClockCard settings={settings} />}
            {settings.featureHardware && <StatsGrid settings={settings} onOpen={() => setTab("system")} />}
          </div>
        )}
      </div>
      <AskBar settings={settings} focusNonce={searchNonce} />
    </div>
  )
}

function ClockCard({ settings, large = false }: { settings: Settings; large?: boolean }) {
  const now = useNow(1000)
  const { time, suffix } = clock(now, settings.clock24h)
  return (
    <Card className={large ? "flex h-full flex-col justify-center px-5" : "px-3 py-2.5"}>
      <div className="flex items-baseline gap-1">
        <span
          className={
            large
              ? "tabular font-display text-[52px] font-semibold leading-none"
              : "tabular font-display text-[30px] font-semibold leading-none"
          }
        >
          {time}
        </span>
        {suffix && <span className="font-small text-[11px] font-medium text-white/50">{suffix}</span>}
      </div>
      <div className="mt-1 text-[12px] text-white/55">{longDate(now)}</div>
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
    <button onClick={onOpen} className="grid min-h-0 flex-1 grid-cols-2 gap-1.5 text-left" title="Open system details">
      <Tile label="CPU" icon={<CpuIcon className="size-3" />} value={pct(snap?.cpu.usage)} series={history.cpu} max={100} />
      <Tile
        label="GPU"
        icon={<GpuIcon className="size-3" />}
        value={gpu?.usage != null ? pct(gpu.usage) : NONE}
        series={history.gpu}
        max={100}
      />
      <Tile label="Memory" icon={<MemoryStickIcon className="size-3" />} value={pct(ram)} series={history.ram} max={100} />
      {t != null ? (
        <Tile
          label={snap?.cpu.temperature != null ? "CPU temp" : "GPU temp"}
          icon={<ThermometerIcon className="size-3" />}
          value={temp(t, settings.temperatureUnit)}
        />
      ) : (
        <Tile label="Download" icon={<ArrowDownIcon className="size-3" />} value={rate(snap?.network.rxBps)} series={history.rx} small />
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
    <Card className="flex min-h-[52px] flex-col gap-1 px-2.5 py-2 transition-colors hover:bg-white/[0.08]">
      <div className="flex items-center justify-between font-small text-[11px] text-white/50">
        {label}
        <span className="text-white/35">{icon}</span>
      </div>
      <div
        className={
          small
            ? "tabular relative z-10 text-[13px] font-semibold"
            : "tabular relative z-10 font-display text-[18px] font-semibold leading-none"
        }
      >
        {value}
      </div>
      {series && <Sparkline values={series} max={max} className="pointer-events-none absolute inset-x-0 bottom-0 h-5 opacity-50" />}
    </Card>
  )
}
