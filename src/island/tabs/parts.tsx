import { useEffect, useRef, useState } from "react"
import {
  CornerDownLeftIcon,
  GlobeIcon,
  PauseIcon,
  PlayIcon,
  SkipBackIcon,
  SkipForwardIcon,
  SparklesIcon,
} from "lucide-react"
import { PeekMascot } from "@/components/peek-mascot"
import { api } from "@/lib/ipc"
import { duration } from "@/lib/format"
import { useChat } from "@/lib/store"
import type { MediaState, Settings, Tab } from "@/lib/types"
import { cn } from "@/lib/utils"
import { useMediaPosition } from "../hooks"
import { AmbientArt, Artwork, Kbd, Visualizer } from "../widgets"

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("relative overflow-hidden rounded-[20px] bg-white/[0.045] ring-1 ring-inset ring-white/[0.06]", className)}>
      {children}
    </div>
  )
}

export function SectionLabel({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-white/45">
      {icon}
      {children}
    </div>
  )
}

export function AppChip({ media }: { media: MediaState }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 truncate rounded-full bg-white/10 px-2 py-0.5 text-[10.5px] font-medium text-white/70">
      <span className={cn("size-1.5 shrink-0 rounded-full", media.playing ? "bg-white" : "bg-white/35")} />
      <span className="truncate">{media.appName || "Media"}</span>
    </span>
  )
}

export function Progress({ media, interactive = true }: { media: MediaState; interactive?: boolean }) {
  const pos = useMediaPosition(media)
  const pct = media.durationMs ? (pos / media.durationMs) * 100 : 0
  const ref = useRef<HTMLDivElement>(null)
  if (!media.durationMs) return <div className="h-5" />
  return (
    <div className="flex items-center gap-2 text-[10.5px] text-white/50">
      <span className="tabular w-9 text-right">{duration(pos)}</span>
      <div
        ref={ref}
        className={cn("group relative h-4 flex-1", interactive && media.canSeek && "cursor-pointer")}
        onClick={(e) => {
          if (!interactive || !media.canSeek || !ref.current) return
          const r = ref.current.getBoundingClientRect()
          const f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
          api.mediaCommand("seek", Math.round(f * media.durationMs))
        }}
      >
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-white/15 transition-[height] group-hover:h-1.5">
          <div className="h-full rounded-full bg-white" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <span className="tabular w-9">-{duration(media.durationMs - pos)}</span>
    </div>
  )
}

export function Transport({ media, size = "md" }: { media: MediaState; size?: "md" | "lg" }) {
  const big = size === "lg"
  const btn = "grid place-items-center rounded-full text-white transition active:scale-90 disabled:opacity-30"
  return (
    <div className={cn("flex items-center justify-center", big ? "gap-5" : "gap-3")}>
      <button
        className={cn(btn, big ? "size-10" : "size-8", "hover:bg-white/10")}
        disabled={!media.canPrevious}
        onClick={() => api.mediaCommand("previous")}
        aria-label="Previous"
      >
        <SkipBackIcon className={cn("fill-current", big ? "size-5" : "size-4")} />
      </button>
      <button
        className={cn(btn, big ? "size-12 bg-white text-black hover:bg-white/90" : "size-10 bg-white/12 hover:bg-white/20")}
        disabled={!media.canPlayPause}
        onClick={() => api.mediaCommand("playPause")}
        aria-label={media.playing ? "Pause" : "Play"}
      >
        {media.playing ? (
          <PauseIcon className={cn("fill-current", big ? "size-5" : "size-[18px]")} />
        ) : (
          <PlayIcon className={cn("translate-x-px fill-current", big ? "size-5" : "size-[18px]")} />
        )}
      </button>
      <button
        className={cn(btn, big ? "size-10" : "size-8", "hover:bg-white/10")}
        disabled={!media.canNext}
        onClick={() => api.mediaCommand("next")}
        aria-label="Next"
      >
        <SkipForwardIcon className={cn("fill-current", big ? "size-5" : "size-4")} />
      </button>
    </div>
  )
}

export function NothingPlaying({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-end">
      <div className="mb-auto pt-5 text-center">
        <div className="text-[14px] font-semibold text-white/90">Nothing playing</div>
        {!compact && (
          <div className="mx-auto mt-1 max-w-[260px] text-[12px] leading-snug text-white/45">
            Play something in Spotify, your browser or any media app and it shows up here.
          </div>
        )}
      </div>
      <PeekMascot className={compact ? "h-[96px] w-[150px]" : "h-[120px] w-[190px]"} />
    </div>
  )
}

export function NowPlayingCard({ media, settings }: { media: MediaState | null; settings: Settings }) {
  if (!media?.available) {
    return (
      <Card className="h-full">
        <NothingPlaying compact />
      </Card>
    )
  }
  return (
    <Card className="h-full">
      <AmbientArt src={media.artwork} opacity={0.55} />
      <div className="relative flex h-full flex-col justify-between gap-2 p-3.5">
        <div className="flex min-h-0 gap-3.5">
          <Artwork src={media.artwork} className="size-[112px] shadow-xl shadow-black/40" rounded="rounded-2xl" />
          <div className="flex min-w-0 flex-1 flex-col gap-1 pt-0.5">
            <div className="flex items-center justify-between gap-2">
              <AppChip media={media} />
              <Visualizer playing={media.playing} mode={settings.visualizer} height={14} />
            </div>
            <div className="mt-1 line-clamp-2 text-[16px] font-semibold leading-snug">{media.title || "Unknown title"}</div>
            <div className="truncate text-[13px] text-white/65">{media.artist}</div>
            {media.album && <div className="truncate text-[12px] text-white/40">{media.album}</div>}
          </div>
        </div>
        <div className="space-y-1.5">
          <Progress media={media} />
          <Transport media={media} />
        </div>
      </div>
    </Card>
  )
}

/** The pull-down search bar: ask the AI or search the web. */
export function AskBar({
  settings,
  setTab,
  focusNonce,
}: {
  settings: Settings
  setTab: (t: Tab) => void
  focusNonce: number
}) {
  const [value, setValue] = useState("")
  const input = useRef<HTMLInputElement>(null)
  const send = useChat((s) => s.send)

  useEffect(() => {
    if (focusNonce > 0) requestAnimationFrame(() => input.current?.focus())
  }, [focusNonce])

  const aiFirst = settings.featureAi && settings.enterAction === "ai"
  const submit = (web: boolean) => {
    const q = value.trim()
    if (!q) return
    if (web || !settings.featureAi) {
      api.openWebSearch(q)
    } else {
      setTab("ask")
      send(q)
    }
    setValue("")
  }

  return (
    <form
      className="group flex h-11 shrink-0 items-center gap-2.5 rounded-2xl bg-white/[0.07] px-3.5 ring-1 ring-inset ring-white/[0.08] transition focus-within:bg-white/[0.1] focus-within:ring-white/20"
      onSubmit={(e) => {
        e.preventDefault()
        submit(!aiFirst)
      }}
    >
      {settings.featureAi ? (
        <SparklesIcon className="size-4 shrink-0 text-white/60" />
      ) : (
        <GlobeIcon className="size-4 shrink-0 text-white/60" />
      )}
      <input
        ref={input}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            submit(aiFirst)
          }
        }}
        placeholder={settings.featureAi ? "Ask anything, or search the web…" : "Search the web…"}
        className="selectable h-full min-w-0 flex-1 bg-transparent text-[13.5px] text-white outline-none placeholder:text-white/35"
        spellCheck={false}
        autoComplete="off"
      />
      <div className="flex items-center gap-1.5 text-[10.5px] text-white/40">
        {settings.featureAi && (
          <span className="flex items-center gap-1">
            <Kbd>
              <CornerDownLeftIcon className="size-3" />
            </Kbd>
            {aiFirst ? "Ask" : "Web"}
            <Kbd>Ctrl ↵</Kbd>
            {aiFirst ? "Web" : "Ask"}
          </span>
        )}
        <button
          type="button"
          onClick={() => submit(true)}
          className="ml-1 grid size-7 place-items-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white"
          title="Search the web"
          aria-label="Search the web"
        >
          <GlobeIcon className="size-4" />
        </button>
      </div>
    </form>
  )
}
