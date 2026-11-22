import { useEffect, useState } from "react"
import {
  ArrowUpRightIcon,
  InfoIcon,
  LoaderCircleIcon,
  MoveIcon,
  PaletteIcon,
  PowerIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
  ToggleRightIcon,
  WandSparklesIcon,
} from "lucide-react"
import { PeekBadge, PeekMascot } from "@/components/peek-mascot"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { api } from "@/lib/ipc"
import { startSettingsSync, useSettings } from "@/lib/store"
import type { Settings, SystemInfo, UpdateInfo } from "@/lib/types"
import { cn } from "@/lib/utils"
import { AiPage } from "./AiPage"
import { AnimationsPage, AppearancePage, FeaturesPage, GeneralPage, PositionPage } from "./pages"
import { Group, Page, Row } from "./ui"

const REPO = "https://github.com/HighSkai/Peek"

const NAV = [
  { id: "general", label: "General", icon: SlidersHorizontalIcon },
  { id: "appearance", label: "Appearance", icon: PaletteIcon },
  { id: "position", label: "Position", icon: MoveIcon },
  { id: "animations", label: "Animations", icon: WandSparklesIcon },
  { id: "features", label: "Features", icon: ToggleRightIcon },
  { id: "ai", label: "AI & Search", icon: SparklesIcon },
  { id: "about", label: "About", icon: InfoIcon },
] as const

type PageId = (typeof NAV)[number]["id"]

export default function SettingsApp() {
  const settings = useSettings((s) => s.settings)
  const update = useSettings((s) => s.update)
  const [page, setPage] = useState<PageId>(() => {
    const p = new URLSearchParams(location.search).get("page")
    return (NAV.find((n) => n.id === p)?.id ?? "general") as PageId
  })
  const [info, setInfo] = useState<SystemInfo | null>(null)

  useEffect(() => {
    startSettingsSync()
    api.systemInfo().then(setInfo).catch(() => {})
  }, [])

  // Theme: follow the setting, or the OS.
  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle("mica", !!info?.mica)
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const apply = () => {
      const pref = settings?.theme ?? "system"
      root.classList.toggle("dark", pref === "dark" || (pref === "system" && media.matches))
    }
    apply()
    media.addEventListener("change", apply)
    return () => media.removeEventListener("change", apply)
  }, [settings?.theme, info?.mica])

  if (!settings) return null
  const set = (patch: Partial<Settings>) => {
    update(patch).catch(() => {})
  }

  return (
    <div className={cn("flex h-full", !info?.mica && "bg-muted/40")}>
      <aside className="flex w-60 shrink-0 flex-col px-3 pb-3 pt-5">
        <div className="mb-5 flex items-center gap-3 px-2">
          <PeekBadge className="size-10" />
          <div>
            <div className="text-[15px] font-semibold leading-tight">Peek</div>
            <div className="text-xs text-muted-foreground">Version {info?.version ?? "—"}</div>
          </div>
        </div>
        <nav className="space-y-0.5">
          {NAV.map((n) => {
            const Icon = n.icon
            return (
              <button
                key={n.id}
                onClick={() => setPage(n.id)}
                className={cn(
                  "flex h-9 w-full items-center gap-3 rounded-md px-3 text-sm transition-colors",
                  page === n.id ? "bg-foreground/[0.08] font-medium text-foreground" : "text-foreground/70 hover:bg-foreground/[0.05]",
                )}
              >
                <Icon className="size-4 opacity-80" />
                {n.label}
              </button>
            )
          })}
        </nav>
        <div className="mt-auto">
          <Button variant="ghost" className="w-full justify-start gap-3 text-foreground/70" onClick={() => api.quit()}>
            <PowerIcon /> Quit Peek
          </Button>
        </div>
      </aside>
      <main className={cn("min-w-0 flex-1 overflow-hidden border-l bg-background", info?.mica && "rounded-tl-xl border-t bg-background/70")}>
        <ScrollArea className="h-full">
          {page === "general" && <GeneralPage s={settings} set={set} />}
          {page === "appearance" && <AppearancePage s={settings} set={set} />}
          {page === "position" && <PositionPage s={settings} set={set} />}
          {page === "animations" && <AnimationsPage s={settings} set={set} />}
          {page === "features" && <FeaturesPage s={settings} set={set} />}
          {page === "ai" && <AiPage s={settings} set={set} />}
          {page === "about" && <AboutPage version={info?.version} />}
        </ScrollArea>
      </main>
    </div>
  )
}

function AboutPage({ version }: { version?: string }) {
  const [checking, setChecking] = useState(false)
  const [update, setUpdate] = useState<UpdateInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  const check = async () => {
    setChecking(true)
    setError(null)
    try {
      setUpdate(await api.checkForUpdates())
    } catch (e) {
      setError(String(e))
    } finally {
      setChecking(false)
    }
  }

  return (
    <Page title="About">
      <div className="flex items-center gap-5 rounded-xl border bg-[var(--panel)] p-5">
        <div className="relative grid size-24 shrink-0 place-items-end overflow-hidden rounded-[22px] bg-[#0a0a0a]">
          <PeekMascot className="h-16 w-24" glow={false} />
        </div>
        <div>
          <div className="text-2xl font-semibold tracking-tight">Peek</div>
          <div className="text-sm text-muted-foreground">A Dynamic Island for Windows 11 · Version {version ?? "—"}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={check} disabled={checking}>
              {checking && <LoaderCircleIcon className="animate-spin" />}
              Check for updates
            </Button>
            <Button size="sm" variant="outline" onClick={() => api.openUrl(REPO)}>
              GitHub <ArrowUpRightIcon />
            </Button>
          </div>
          {update && (
            <p className="mt-2 text-sm">
              {update.available ? (
                <>
                  Peek {update.latest} is available.{" "}
                  <button className="underline underline-offset-2" onClick={() => api.openUrl(update.url)}>
                    Download
                  </button>
                </>
              ) : (
                <span className="text-muted-foreground">You're on the latest version.</span>
              )}
            </p>
          )}
          {error && <p className="mt-2 text-sm text-muted-foreground">Couldn't check for updates: {error}</p>}
        </div>
      </div>

      <Group title="Links">
        <Row label="Release notes">
          <Button variant="ghost" size="sm" onClick={() => api.openUrl(`${REPO}/releases`)}>
            Open <ArrowUpRightIcon />
          </Button>
        </Row>
        <Row label="Report a bug or request a feature">
          <Button variant="ghost" size="sm" onClick={() => api.openUrl(`${REPO}/issues/new/choose`)}>
            Open <ArrowUpRightIcon />
          </Button>
        </Row>
      </Group>

      <Group
        title="Open source"
        footer="Peek is MIT licensed. Built with Tauri, React, shadcn/ui, Radix UI, Tailwind CSS, Motion, Lucide, sysinfo, windows-rs and nvml-wrapper. Temperatures and fan speeds can come from LibreHardwareMonitor (MPL-2.0), which runs separately."
      >
        <Row label="License">
          <Button variant="ghost" size="sm" onClick={() => api.openUrl(`${REPO}/blob/main/LICENSE`)}>
            MIT <ArrowUpRightIcon />
          </Button>
        </Row>
      </Group>
    </Page>
  )
}
