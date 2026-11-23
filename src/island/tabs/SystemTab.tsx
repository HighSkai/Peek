import {
  ArrowDownIcon,
  ArrowUpIcon,
  BatteryChargingIcon,
  BatteryIcon,
  ClockIcon,
  CpuIcon,
  ExternalLinkIcon,
  FanIcon,
  GpuIcon,
  HardDriveIcon,
  MemoryStickIcon,
  NetworkIcon,
  ThermometerIcon,
} from "lucide-react"
import { Percent } from "@/components/animated-number"
import { ScrollArea } from "@/components/ui/scroll-area"
import { api } from "@/lib/ipc"
import { bytes, ghz, NONE, pct, rate, temp, uptime } from "@/lib/format"
import { useHardware } from "@/lib/store"
import type { GpuInfo, Settings } from "@/lib/types"
import { cn } from "@/lib/utils"
import { Meter, ProgressRing, Ring, Sparkline } from "../widgets"
import { Card, SectionLabel } from "./parts"

const LHM_URL = "https://github.com/LibreHardwareMonitor/LibreHardwareMonitor/releases"

export function SystemTab({ settings }: { settings: Settings }) {
  const snap = useHardware((s) => s.snapshot)
  const history = useHardware((s) => s.history)
  const unit = settings.temperatureUnit

  if (!snap) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-[12.5px] text-white/55">
        <ProgressRing /> Reading sensors
      </div>
    )
  }

  const ramPct = snap.memory.total ? (snap.memory.used / snap.memory.total) * 100 : 0

  return (
    <ScrollArea className="h-full">
      <div className="grid grid-cols-2 gap-2 pb-1 pt-0.5">
        {/* CPU */}
        <Card className="col-span-2 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <SectionLabel icon={<CpuIcon className="size-3.5" />}>Processor</SectionLabel>
              <div className="mt-0.5 truncate text-[12.5px] text-white/85" title={snap.cpu.name}>
                {snap.cpu.name || "CPU"}
              </div>
            </div>
            <Percent value={snap.cpu.usage} className="tabular font-display text-[24px] font-semibold leading-none" />
          </div>
          <Sparkline values={history.cpu} max={100} className="mt-1.5 h-8" />
          <div className="mt-1.5 flex h-6 items-end gap-[3px]" aria-label="Per-thread usage">
            {snap.cpu.perCore.map((v, i) => (
              <div key={i} className="relative h-full flex-1 overflow-hidden rounded-[2px] bg-white/[0.07]" title={`Thread ${i + 1}: ${pct(v)}`}>
                <div
                  className="absolute inset-x-0 bottom-0 rounded-[2px] bg-white/80 transition-[height] duration-500"
                  style={{ height: `${Math.max(4, v)}%` }}
                />
              </div>
            ))}
          </div>
          <Stats
            className="mt-2.5"
            items={[
              ["Clock", ghz(snap.cpu.frequencyMhz)],
              ["Temperature", temp(snap.cpu.temperature, unit)],
              ["Power", snap.cpu.powerWatts != null ? `${snap.cpu.powerWatts.toFixed(0)} W` : NONE],
              ["Cores", snap.cpu.physicalCores ? `${snap.cpu.physicalCores} / ${snap.cpu.logicalCores}` : String(snap.cpu.logicalCores)],
            ]}
          />
        </Card>

        {/* GPUs */}
        {snap.gpus.map((g, i) => (
          <GpuCard key={`${g.name}-${i}`} gpu={g} history={i === 0 ? history.gpu : undefined} unit={unit} wide={snap.gpus.length === 1} />
        ))}

        {/* Memory */}
        <Card className="p-3">
          <SectionLabel icon={<MemoryStickIcon className="size-3.5" />}>Memory</SectionLabel>
          <div className="mt-2 flex items-center gap-2.5">
            <Ring value={ramPct} size={38} stroke={3.5} />
            <div>
              <Percent value={ramPct} className="tabular block font-display text-[17px] font-semibold leading-tight" />
              <div className="tabular font-small text-[11px] text-white/50">
                {bytes(snap.memory.used)} of {bytes(snap.memory.total)}
              </div>
            </div>
          </div>
          {snap.memory.swapTotal > 0 && (
            <div className="mt-2.5">
              <div className="mb-1 flex justify-between font-small text-[11px] text-white/50">
                <span>Page file</span>
                <span className="tabular">
                  {bytes(snap.memory.swapUsed)} / {bytes(snap.memory.swapTotal)}
                </span>
              </div>
              <Meter value={(snap.memory.swapUsed / snap.memory.swapTotal) * 100} />
            </div>
          )}
        </Card>

        {/* Network */}
        <Card className="p-3">
          <SectionLabel icon={<NetworkIcon className="size-3.5" />}>Network</SectionLabel>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div>
              <div className="flex items-center gap-1 font-small text-[11px] text-white/50">
                <ArrowDownIcon className="size-3" /> Down
              </div>
              <div className="tabular text-[13.5px] font-semibold">{rate(snap.network.rxBps)}</div>
            </div>
            <div>
              <div className="flex items-center gap-1 font-small text-[11px] text-white/50">
                <ArrowUpIcon className="size-3" /> Up
              </div>
              <div className="tabular text-[13.5px] font-semibold">{rate(snap.network.txBps)}</div>
            </div>
          </div>
          <div className="relative mt-1 h-8">
            <Sparkline values={history.rx} className="absolute inset-0 h-8" />
            <Sparkline values={history.tx} className="absolute inset-0 h-8" strokeOpacity={0.4} fillOpacity={0.05} />
          </div>
        </Card>

        {/* Storage */}
        {snap.disks.length > 0 && (
          <Card className="col-span-2 p-3">
            <SectionLabel icon={<HardDriveIcon className="size-3.5" />}>Storage</SectionLabel>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2.5">
              {snap.disks.map((d) => (
                <div key={d.mount}>
                  <div className="mb-1 flex items-baseline justify-between gap-2 text-[12px]">
                    <span className="truncate font-medium text-white/85">
                      {d.mount.replace(/\\$/, "")} <span className="font-normal text-white/45">{d.name}</span>
                    </span>
                    <span className="tabular shrink-0 font-small text-[11px] text-white/50">{bytes(d.total - d.used)} free</span>
                  </div>
                  <Meter value={(d.used / d.total) * 100} />
                  {(d.readBps > 0 || d.writeBps > 0) && (
                    <div className="tabular mt-1 font-small text-[10.5px] text-white/40">
                      Read {rate(d.readBps)}, write {rate(d.writeBps)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Sensors */}
        {snap.sensorSource ? (
          <>
            <SensorList
              title="Temperatures"
              icon={<ThermometerIcon className="size-3.5" />}
              items={snap.temperatures.map((t) => ({ ...t, display: temp(t.value, unit) }))}
            />
            <SensorList
              title="Fans"
              icon={<FanIcon className="size-3.5" />}
              items={snap.fans.map((f) => ({ ...f, display: `${Math.round(f.value)} RPM` }))}
              empty="No fan sensors reported"
            />
          </>
        ) : (
          <Card className="col-span-2 flex items-center justify-between gap-4 p-3">
            <div className="min-w-0">
              <SectionLabel icon={<ThermometerIcon className="size-3.5" />}>Temperatures and fans</SectionLabel>
              <p className="mt-1 text-[12px] leading-snug text-white/55">
                Windows doesn't give apps CPU temperatures or fan speeds. Run LibreHardwareMonitor in the background and Peek
                reads its sensors automatically.
              </p>
            </div>
            <button
              onClick={() => api.openUrl(LHM_URL)}
              className="flex shrink-0 items-center gap-1.5 rounded-full bg-white px-3 py-1 text-[12px] font-semibold text-black transition-colors hover:bg-white/90"
            >
              Download <ExternalLinkIcon className="size-3" />
            </button>
          </Card>
        )}

        {/* Footer */}
        <div className="col-span-2 flex items-center justify-between px-1 font-small text-[11px] text-white/45">
          <span className="flex items-center gap-1.5">
            <ClockIcon className="size-3" /> Up {uptime(snap.uptimeSecs)}
          </span>
          {snap.battery && (
            <span className="flex items-center gap-1.5">
              {snap.battery.charging ? <BatteryChargingIcon className="size-3" /> : <BatteryIcon className="size-3" />}
              {Math.round(snap.battery.percent)}%{snap.battery.pluggedIn ? ", plugged in" : ""}
            </span>
          )}
          {snap.sensorSource && <span>Sensors from {snap.sensorSource}</span>}
        </div>
      </div>
    </ScrollArea>
  )
}

function GpuCard({ gpu, history, unit, wide }: { gpu: GpuInfo; history?: number[]; unit: "c" | "f"; wide: boolean }) {
  const vram = gpu.memoryTotal && gpu.memoryUsed != null ? (gpu.memoryUsed / gpu.memoryTotal) * 100 : null
  return (
    <Card className={cn("p-3", wide && "col-span-2")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <SectionLabel icon={<GpuIcon className="size-3.5" />}>Graphics</SectionLabel>
          <div className="mt-0.5 truncate text-[12.5px] text-white/85" title={gpu.name}>
            {gpu.name}
          </div>
        </div>
        <Percent value={gpu.usage} className="tabular font-display text-[24px] font-semibold leading-none" />
      </div>
      {history && <Sparkline values={history} max={100} className="mt-1.5 h-8" />}
      {vram != null && (
        <div className="mt-2">
          <div className="mb-1 flex justify-between font-small text-[11px] text-white/50">
            <span>Video memory</span>
            <span className="tabular">
              {bytes(gpu.memoryUsed)} / {bytes(gpu.memoryTotal)}
            </span>
          </div>
          <Meter value={vram} />
        </div>
      )}
      <Stats
        className="mt-2.5"
        items={[
          ["Temperature", temp(gpu.temperature, unit)],
          ["Fan", gpu.fanPercent != null ? `${Math.round(gpu.fanPercent)}%` : gpu.fanRpm != null ? `${Math.round(gpu.fanRpm)} RPM` : NONE],
          ["Power", gpu.powerWatts != null ? `${gpu.powerWatts.toFixed(0)} W` : NONE],
          ["Clock", gpu.clockMhz != null ? `${Math.round(gpu.clockMhz)} MHz` : NONE],
        ]}
      />
    </Card>
  )
}

function Stats({ items, className }: { items: [string, string][]; className?: string }) {
  return (
    <div className={cn("grid grid-cols-4 gap-2", className)}>
      {items.map(([k, v]) => (
        <div key={k}>
          <div className="font-small text-[11px] text-white/45">{k}</div>
          <div className="tabular truncate text-[12px] font-medium text-white/90">{v}</div>
        </div>
      ))}
    </div>
  )
}

function SensorList({
  title,
  icon,
  items,
  empty = "No sensors reported",
}: {
  title: string
  icon: React.ReactNode
  items: { hardware: string; name: string; display: string }[]
  empty?: string
}) {
  return (
    <Card className="p-3">
      <SectionLabel icon={icon}>{title}</SectionLabel>
      <div className="mt-1.5 space-y-0.5">
        {items.length === 0 && <div className="text-[12px] text-white/40">{empty}</div>}
        {items.slice(0, 12).map((s) => (
          <div key={`${s.hardware}-${s.name}`} className="flex items-baseline justify-between gap-3 text-[12px]">
            <span className="min-w-0 truncate text-white/70" title={`${s.hardware}, ${s.name}`}>
              {s.name}
              <span className="ml-1 text-white/30">{shortHardware(s.hardware)}</span>
            </span>
            <span className="tabular shrink-0 font-medium">{s.display}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}

function shortHardware(name: string) {
  return name.replace(/^(AMD|Intel\(R\)|Intel|NVIDIA|Nuvoton|ITE)\s+/i, "").split(" ").slice(0, 2).join(" ")
}
