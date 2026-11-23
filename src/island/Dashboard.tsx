import { useEffect, useRef } from "react"
import { AnimatePresence, motion } from "motion/react"
import {
  ActivityIcon,
  ChevronLeftIcon,
  ChevronUpIcon,
  HouseIcon,
  MessageCircleIcon,
  MusicIcon,
  PinIcon,
  PinOffIcon,
  SettingsIcon,
} from "lucide-react"
import { HANDLE_H, HEADER_H } from "@/lib/layout"
import { slide, uiTransition, useMotion } from "@/lib/motion"
import { useIslandUi, useUpdates } from "@/lib/store"
import type { Settings, Tab } from "@/lib/types"
import { cn } from "@/lib/utils"
import { SettingsPanel } from "@/settings/SettingsPanel"
import { AskTab } from "./tabs/AskTab"
import { HomeTab } from "./tabs/HomeTab"
import { MediaTab } from "./tabs/MediaTab"
import { SystemTab } from "./tabs/SystemTab"

const TABS: { id: Tab; label: string; icon: typeof HouseIcon }[] = [
  { id: "home", label: "Home", icon: HouseIcon },
  { id: "media", label: "Music", icon: MusicIcon },
  { id: "system", label: "System", icon: ActivityIcon },
  { id: "ask", label: "Ask", icon: MessageCircleIcon },
]

/**
 * The open island: section tabs in the header, the section below. The header is a drag
 * handle (push it up to close); so is the strip along the bottom edge, drawn by
 * IslandApp. Laid out at regular density.
 */
export function Dashboard({
  settings,
  width,
  height,
  pinned,
  setPinned,
  onCollapse,
  searchNonce,
}: {
  settings: Settings
  width: number
  height: number
  pinned: boolean
  setPinned: (p: boolean) => void
  onCollapse: () => void
  searchNonce: number
}) {
  const tab = useIslandUi((s) => s.tab)
  const setTab = useIslandUi((s) => s.setTab)
  const openSettings = useIslandUi((s) => s.openSettings)
  const closeSettings = useIslandUi((s) => s.closeSettings)
  const updateReady = useUpdates((s) => !!s.info?.available)
  const { level, speed } = useMotion()

  const tabs = TABS.filter(
    (t) =>
      (t.id !== "media" || settings.featureMedia) &&
      (t.id !== "system" || settings.featureHardware) &&
      (t.id !== "ask" || settings.featureAi),
  )
  const inSettings = tab === "settings"
  const active: Tab = inSettings ? "settings" : tabs.some((t) => t.id === tab) ? tab : "home"
  const order = inSettings ? tabs.length : tabs.findIndex((t) => t.id === active)
  const prevOrder = useRef(order)
  const direction = order >= prevOrder.current ? 1 : -1
  prevOrder.current = order
  const ui = uiTransition(level, speed)

  // Ctrl+1..4 switch sections.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.altKey || e.shiftKey) return
      const i = Number(e.key) - 1
      if (Number.isInteger(i) && i >= 0 && i < tabs.length) {
        e.preventDefault()
        setTab(tabs[i].id)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [tabs, setTab])

  return (
    <div className="absolute inset-0 text-white" style={{ width, height }}>
      {/* Header: sections on the left, window actions on the right. Drag it up to close. */}
      <div
        data-drag-handle
        className={cn("flex items-center justify-between px-2.5", settings.mode === "notch" ? "pt-0.5" : "pt-1")}
        style={{ height: HEADER_H }}
      >
        <AnimatePresence initial={false} mode="popLayout">
          {inSettings ? (
            <motion.div
              key="settings-title"
              className="flex items-center gap-1"
              initial={{ opacity: 0, x: slide(level, 8) }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: slide(level, 8) }}
              transition={ui}
            >
              <HeaderButton label="Back" onClick={closeSettings}>
                <ChevronLeftIcon className="size-4" />
              </HeaderButton>
              <span className="text-[13px] font-semibold">Settings</span>
            </motion.div>
          ) : (
            <motion.nav
              key="tabs"
              className="flex items-center gap-0.5"
              aria-label="Sections"
              initial={{ opacity: 0, x: slide(level, -8) }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: slide(level, -8) }}
              transition={ui}
            >
              {tabs.map((t, i) => {
                const Icon = t.icon
                const selected = t.id === active
                return (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    title={`${t.label} (Ctrl+${i + 1})`}
                    aria-current={selected ? "page" : undefined}
                    className={cn(
                      "relative flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium transition-colors",
                      selected ? "text-white" : "text-white/55 hover:bg-white/[0.06] hover:text-white/90",
                    )}
                  >
                    {selected && (
                      <motion.span
                        layoutId="peek-tab"
                        className="absolute inset-0 rounded-full bg-white/[0.13]"
                        transition={uiTransition(level, speed)}
                      />
                    )}
                    <Icon className="relative size-[14px]" />
                    <span className="relative">{t.label}</span>
                  </button>
                )
              })}
            </motion.nav>
          )}
        </AnimatePresence>
        <div className="flex items-center gap-0.5">
          <HeaderButton label={pinned ? "Unpin" : "Keep open"} onClick={() => setPinned(!pinned)} active={pinned}>
            {pinned ? <PinOffIcon className="size-[15px]" /> : <PinIcon className="size-[15px]" />}
          </HeaderButton>
          {!inSettings && (
            <HeaderButton
              label={updateReady ? "Settings (an update is available)" : "Settings"}
              onClick={() => openSettings(updateReady ? "updates" : undefined)}
            >
              <SettingsIcon className="size-[15px]" />
              {updateReady && <span className="absolute right-1 top-1 size-1.5 rounded-full bg-white" />}
            </HeaderButton>
          )}
          <HeaderButton label="Close (Esc)" onClick={onCollapse}>
            <ChevronUpIcon className="size-4" />
          </HeaderButton>
        </div>
      </div>

      {/* Section */}
      <div className="absolute inset-x-3 overflow-hidden" style={{ top: HEADER_H, bottom: HANDLE_H }}>
        <AnimatePresence initial={false} mode="popLayout" custom={direction}>
          <motion.div
            key={active}
            className="absolute inset-0"
            initial={{ opacity: 0, x: slide(level, 12 * direction) }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: slide(level, -12 * direction) }}
            transition={ui}
          >
            {active === "home" && <HomeTab settings={settings} searchNonce={searchNonce} />}
            {active === "media" && <MediaTab settings={settings} />}
            {active === "system" && <SystemTab settings={settings} />}
            {active === "ask" && <AskTab settings={settings} searchNonce={searchNonce} />}
            {active === "settings" && <SettingsPanel settings={settings} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

function HeaderButton({
  children,
  label,
  onClick,
  active,
}: {
  children: React.ReactNode
  label: string
  onClick: () => void
  active?: boolean
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        "relative grid size-7 place-items-center rounded-full transition-colors",
        active ? "bg-white/15 text-white" : "text-white/55 hover:bg-white/10 hover:text-white",
      )}
    >
      {children}
    </button>
  )
}
