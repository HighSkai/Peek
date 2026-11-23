import { useRef } from "react"
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
import { useIslandUi } from "@/lib/store"
import type { Settings, Tab } from "@/lib/types"
import { cn } from "@/lib/utils"
import { SettingsPanel } from "@/settings/SettingsPanel"
import { AskTab } from "./tabs/AskTab"
import { HomeTab } from "./tabs/HomeTab"
import { MediaTab } from "./tabs/MediaTab"
import { SystemTab } from "./tabs/SystemTab"

const TABS: { id: Tab; label: string; icon: typeof HouseIcon }[] = [
  { id: "home", label: "Home", icon: HouseIcon },
  { id: "media", label: "Now playing", icon: MusicIcon },
  { id: "system", label: "System", icon: ActivityIcon },
  { id: "ask", label: "Ask", icon: MessageCircleIcon },
]

/**
 * The open island. The header and the handle at the bottom are drag handles (see
 * IslandApp): push them up to close. Laid out at regular density.
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
  const anim = settings.animations
  const speed = settings.animationSpeed || 1

  return (
    <div className="absolute inset-0 text-white" style={{ width, height }}>
      {/* Header: tabs on the left, window actions on the right. Drag it up to close. */}
      <div
        data-drag-handle
        className={cn("flex h-10 items-center justify-between pl-2 pr-1.5", settings.mode === "notch" ? "pt-0.5" : "pt-1")}
      >
        <AnimatePresence initial={false} mode="popLayout">
          {inSettings ? (
            <motion.div
              key="settings-title"
              className="flex items-center gap-0.5"
              initial={anim ? { opacity: 0, x: 8 } : false}
              animate={{ opacity: 1, x: 0 }}
              exit={anim ? { opacity: 0, x: 8 } : { opacity: 0 }}
              transition={{ duration: 0.18 }}
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
              initial={anim ? { opacity: 0, x: -8 } : false}
              animate={{ opacity: 1, x: 0 }}
              exit={anim ? { opacity: 0, x: -8 } : { opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              {tabs.map((t) => {
                const Icon = t.icon
                const selected = t.id === active
                return (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    title={t.label}
                    aria-label={t.label}
                    aria-current={selected ? "page" : undefined}
                    className={cn(
                      "relative flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium transition-colors",
                      selected ? "text-white" : "text-white/50 hover:text-white/85",
                    )}
                  >
                    {selected && (
                      <motion.span
                        layoutId="peek-tab"
                        className="absolute inset-0 rounded-full bg-white/[0.12]"
                        transition={{ type: "spring", bounce: 0.18, visualDuration: 0.3 / speed }}
                      />
                    )}
                    <Icon className="relative size-[15px]" />
                    <AnimatePresence initial={false}>
                      {selected && (
                        <motion.span
                          className="relative overflow-hidden whitespace-nowrap"
                          initial={{ width: 0, opacity: 0 }}
                          animate={{ width: "auto", opacity: 1 }}
                          exit={{ width: 0, opacity: 0 }}
                          transition={{ type: "spring", bounce: 0, visualDuration: 0.22 / speed }}
                        >
                          {t.label}
                        </motion.span>
                      )}
                    </AnimatePresence>
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
            <HeaderButton label="Settings" onClick={() => openSettings()}>
              <SettingsIcon className="size-[15px]" />
            </HeaderButton>
          )}
          <HeaderButton label="Close" onClick={onCollapse}>
            <ChevronUpIcon className="size-4" />
          </HeaderButton>
        </div>
      </div>

      {/* Content */}
      <div className="absolute inset-x-2 bottom-4 top-10 overflow-hidden">
        <AnimatePresence initial={false} mode="popLayout" custom={direction}>
          <motion.div
            key={active}
            className="absolute inset-0"
            custom={direction}
            initial={anim ? { opacity: 0, x: 14 * direction } : false}
            animate={{ opacity: 1, x: 0 }}
            exit={anim ? { opacity: 0, x: -14 * direction } : { opacity: 0 }}
            transition={{ type: "spring", bounce: 0, visualDuration: 0.26 / speed }}
          >
            {active === "home" && <HomeTab settings={settings} searchNonce={searchNonce} />}
            {active === "media" && <MediaTab settings={settings} />}
            {active === "system" && <SystemTab settings={settings} />}
            {active === "ask" && <AskTab settings={settings} searchNonce={searchNonce} />}
            {active === "settings" && <SettingsPanel settings={settings} />}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Handle: tap or push up to close, pull down to stretch. */}
      <div
        data-drag-handle
        data-grabber
        role="button"
        aria-label="Close"
        className="absolute inset-x-0 bottom-0 flex h-4 items-center justify-center"
      >
        <span className="h-1 w-9 rounded-full bg-white/25 transition-[width,background-color] duration-200 hover:bg-white/50 group-data-[dragging]/island:w-12 group-data-[dragging]/island:bg-white/60" />
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
        "grid size-7 place-items-center rounded-full transition-colors",
        active ? "bg-white/15 text-white" : "text-white/55 hover:bg-white/10 hover:text-white",
      )}
    >
      {children}
    </button>
  )
}
