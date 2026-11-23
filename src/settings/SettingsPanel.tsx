import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import {
  ArrowUpRightIcon,
  InfoIcon,
  LoaderCircleIcon,
  MessageCircleIcon,
  MoveIcon,
  PaletteIcon,
  PowerIcon,
  SlidersHorizontalIcon,
  ToggleRightIcon,
  WavesIcon,
} from "lucide-react"
import { PeekBadge } from "@/components/peek-mascot"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { api } from "@/lib/ipc"
import { useIslandUi, useSettings, type SettingsPage } from "@/lib/store"
import type { Settings, UpdateInfo } from "@/lib/types"
import { cn } from "@/lib/utils"
import { AiPage } from "./AiPage"
import { AppearancePage, FeaturesPage, GeneralPage, MotionPage, PositionPage } from "./pages"
import { Group, Page, Row } from "./ui"

const REPO = "https://github.com/HighSkai/Peek"

const NAV: { id: SettingsPage; label: string; icon: typeof InfoIcon }[] = [
  { id: "general", label: "General", icon: SlidersHorizontalIcon },
  { id: "appearance", label: "Appearance", icon: PaletteIcon },
  { id: "position", label: "Position", icon: MoveIcon },
  { id: "motion", label: "Motion", icon: WavesIcon },
  { id: "features", label: "Features", icon: ToggleRightIcon },
  { id: "ai", label: "AI and search", icon: MessageCircleIcon },
  { id: "about", label: "About", icon: InfoIcon },
]

/** Settings, inside the open island: a navigation rail on the left, the page on the right. */
export function SettingsPanel({ settings }: { settings: Settings }) {
  const page = useIslandUi((s) => s.settingsPage)
  const setPage = useIslandUi((s) => s.setSettingsPage)
  const update = useSettings((s) => s.update)
  const [version, setVersion] = useState<string | undefined>()

  useEffect(() => {
    api
      .systemInfo()
      .then((i) => setVersion(i.version))
      .catch(() => {})
  }, [])

  const set = (patch: Partial<Settings>) => {
    update(patch).catch(() => {})
  }

  return (
    <div className="flex h-full gap-2 pt-0.5">
      <nav className="flex w-[132px] shrink-0 flex-col" aria-label="Settings pages">
        <div className="space-y-px">
          {NAV.map((n) => {
            const Icon = n.icon
            const selected = page === n.id
            return (
              <button
                key={n.id}
                onClick={() => setPage(n.id)}
                aria-current={selected ? "page" : undefined}
                className={cn(
                  "relative flex h-7 w-full items-center gap-2 rounded-ctl px-2 text-[12.5px] transition-colors",
                  selected ? "bg-white/[0.09] text-white" : "text-white/65 hover:bg-white/[0.05] hover:text-white/90",
                )}
              >
                {selected && (
                  <motion.span
                    layoutId="settings-nav"
                    className="absolute left-0 top-1/2 h-3.5 w-[3px] -translate-y-1/2 rounded-full bg-white"
                    transition={{ type: "spring", bounce: 0.2, visualDuration: 0.25 }}
                  />
                )}
                <Icon className="size-3.5 shrink-0 opacity-80" />
                <span className="truncate">{n.label}</span>
              </button>
            )
          })}
        </div>
        <button
          onClick={() => api.quit()}
          className="mt-auto flex h-7 w-full items-center gap-2 rounded-ctl px-2 text-[12.5px] text-white/55 transition-colors hover:bg-white/[0.05] hover:text-white/90"
        >
          <PowerIcon className="size-3.5" /> Quit Peek
        </button>
      </nav>

      <div className="relative min-w-0 flex-1">
        <AnimatePresence initial={false} mode="popLayout">
          <motion.div
            key={page}
            className="absolute inset-0"
            initial={settings.animations ? { opacity: 0, y: 6 } : false}
            animate={{ opacity: 1, y: 0 }}
            exit={settings.animations ? { opacity: 0, y: -4 } : { opacity: 0 }}
            transition={{ type: "spring", bounce: 0, visualDuration: 0.22 }}
          >
            <ScrollArea className="h-full">
              {page === "general" && <GeneralPage s={settings} set={set} />}
              {page === "appearance" && <AppearancePage s={settings} set={set} />}
              {page === "position" && <PositionPage s={settings} set={set} />}
              {page === "motion" && <MotionPage s={settings} set={set} />}
              {page === "features" && <FeaturesPage s={settings} set={set} />}
              {page === "ai" && <AiPage s={settings} set={set} />}
              {page === "about" && <AboutPage version={version} />}
            </ScrollArea>
          </motion.div>
        </AnimatePresence>
      </div>
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
    <Page>
      <Group>
        <div className="flex items-center gap-3 p-3">
          <PeekBadge className="size-11 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold">Peek</div>
            <div className="text-[11.5px] text-white/50">A Dynamic Island for Windows 11. Version {version ?? "unknown"}</div>
            {update && (
              <p className="mt-0.5 text-[11.5px]">
                {update.available ? (
                  <>
                    Peek {update.latest} is available.{" "}
                    <button className="underline underline-offset-2" onClick={() => api.openUrl(update.url)}>
                      Download
                    </button>
                  </>
                ) : (
                  <span className="text-white/50">You have the latest version.</span>
                )}
              </p>
            )}
            {error && <p className="mt-0.5 text-[11.5px] text-white/50">Couldn't check for updates: {error}</p>}
          </div>
          <Button size="sm" onClick={check} disabled={checking}>
            {checking && <LoaderCircleIcon className="animate-spin" />}
            Check for updates
          </Button>
        </div>
      </Group>

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
        <Row label="License">
          <Button variant="ghost" size="sm" onClick={() => api.openUrl(`${REPO}/blob/main/LICENSE`)}>
            MIT <ArrowUpRightIcon />
          </Button>
        </Row>
      </Group>

      <p className="px-1 text-[11.5px] leading-snug text-white/45">
        Built with Tauri, React, shadcn/ui, Radix UI, Tailwind CSS, Motion, Lucide, sysinfo, windows-rs and nvml-wrapper.
        Temperatures and fan speeds can come from LibreHardwareMonitor (MPL-2.0), which runs separately.
      </p>
    </Page>
  )
}
