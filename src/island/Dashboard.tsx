import { useRef } from "react"
import { AnimatePresence, motion } from "motion/react"
import {
  ActivityIcon,
  ChevronUpIcon,
  HouseIcon,
  MusicIcon,
  PinIcon,
  PinOffIcon,
  Settings2Icon,
  SparklesIcon,
} from "lucide-react"
import { api } from "@/lib/ipc"
import type { Settings, Tab } from "@/lib/types"
import { cn } from "@/lib/utils"
import { AskTab } from "./tabs/AskTab"
import { HomeTab } from "./tabs/HomeTab"
import { MediaTab } from "./tabs/MediaTab"
import { SystemTab } from "./tabs/SystemTab"

const TABS: { id: Tab; label: string; icon: typeof HouseIcon }[] = [
  { id: "home", label: "Home", icon: HouseIcon },
  { id: "media", label: "Now Playing", icon: MusicIcon },
  { id: "system", label: "System", icon: ActivityIcon },
  { id: "ask", label: "Ask", icon: SparklesIcon },
]

export function Dashboard({
  settings,
  width,
  height,
  tab,
  setTab,
  pinned,
  setPinned,
  onCollapse,
  searchNonce,
}: {
  settings: Settings
  width: number
  height: number
  tab: Tab
  setTab: (t: Tab) => void
  pinned: boolean
  setPinned: (p: boolean) => void
  onCollapse: () => void
  searchNonce: number
}) {
  const tabs = TABS.filter(
    (t) =>
      (t.id !== "media" || settings.featureMedia) &&
      (t.id !== "system" || settings.featureHardware) &&
      (t.id !== "ask" || settings.featureAi),
  )
  const active = tabs.some((t) => t.id === tab) ? tab : "home"
  const order = tabs.findIndex((t) => t.id === active)
  const prevOrder = useRef(order)
  const direction = order >= prevOrder.current ? 1 : -1
  prevOrder.current = order

  const grab = useRef<{ y: number } | null>(null)

  return (
    <div className="absolute left-1/2 top-0 -translate-x-1/2 text-white" style={{ width, height }}>
      {/* Header */}
      <div className={cn("flex h-12 items-center justify-between px-3", settings.mode === "notch" ? "pt-1" : "pt-1.5")}>
        <nav className="flex items-center gap-1" aria-label="Sections">
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
                  "relative flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium transition-colors",
                  selected ? "text-white" : "text-white/50 hover:text-white/80",
                )}
              >
                {selected && (
                  <motion.span
                    layoutId="peek-tab"
                    className="absolute inset-0 rounded-full bg-white/[0.12]"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
                  />
                )}
                <Icon className="relative size-4" />
                <AnimatePresence initial={false}>
                  {selected && (
                    <motion.span
                      className="relative overflow-hidden whitespace-nowrap"
                      initial={{ width: 0, opacity: 0 }}
                      animate={{ width: "auto", opacity: 1 }}
                      exit={{ width: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      {t.label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </button>
            )
          })}
        </nav>
        <div className="flex items-center gap-0.5">
          <HeaderButton label={pinned ? "Unpin" : "Keep open"} onClick={() => setPinned(!pinned)} active={pinned}>
            {pinned ? <PinOffIcon className="size-4" /> : <PinIcon className="size-4" />}
          </HeaderButton>
          <HeaderButton label="Settings" onClick={() => api.openSettings()}>
            <Settings2Icon className="size-4" />
          </HeaderButton>
          <HeaderButton label="Close" onClick={onCollapse}>
            <ChevronUpIcon className="size-4" />
          </HeaderButton>
        </div>
      </div>

      {/* Content */}
      <div className="absolute inset-x-2.5 bottom-5 top-12 overflow-hidden rounded-[26px] bg-white/[0.035] ring-1 ring-inset ring-white/[0.06]">
        <AnimatePresence initial={false} mode="popLayout" custom={direction}>
          <motion.div
            key={active}
            className="absolute inset-0"
            custom={direction}
            initial={settings.animations ? { opacity: 0, x: 24 * direction } : false}
            animate={{ opacity: 1, x: 0 }}
            exit={settings.animations ? { opacity: 0, x: -24 * direction } : { opacity: 0 }}
            transition={{ type: "spring", bounce: 0.15, duration: 0.35 / (settings.animationSpeed || 1) }}
          >
            {active === "home" && <HomeTab settings={settings} setTab={setTab} searchNonce={searchNonce} />}
            {active === "media" && <MediaTab settings={settings} />}
            {active === "system" && <SystemTab settings={settings} />}
            {active === "ask" && <AskTab settings={settings} searchNonce={searchNonce} />}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Grabber: click or drag up to close */}
      <div
        className="absolute inset-x-0 bottom-0 flex h-5 items-center justify-center"
        onPointerDown={(e) => {
          grab.current = { y: e.clientY }
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerUp={(e) => {
          const g = grab.current
          grab.current = null
          if (g && (g.y - e.clientY > 8 || Math.abs(g.y - e.clientY) < 4)) onCollapse()
        }}
      >
        <span className="h-1 w-10 rounded-full bg-white/25 transition-colors hover:bg-white/50" />
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
        "grid size-8 place-items-center rounded-full transition-colors",
        active ? "bg-white/15 text-white" : "text-white/55 hover:bg-white/10 hover:text-white",
      )}
    >
      {children}
    </button>
  )
}
