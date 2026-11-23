import { useEffect, useRef, useState } from "react"
import { CornerDownLeftIcon, GlobeIcon, PauseIcon, PlayIcon, SearchIcon, SkipBackIcon, SkipForwardIcon } from "lucide-react"
import { PeekMascot } from "@/components/peek-mascot"
import { api } from "@/lib/ipc"
import { duration } from "@/lib/format"
import { useChat, useIslandUi } from "@/lib/store"
import type { MediaState, Settings } from "@/lib/types"
import { cn } from "@/lib/utils"
import { useMediaPosition } from "../hooks"
import { AmbientArt, Artwork, Kbd, Visualizer } from "../widgets"

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("relative overflow-hidden rounded-card bg-white/[0.055]", className)}>{children}</div>
}

/** A small heading for a card, in sentence case. */
export function SectionLabel({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-[12px] font-medium text-white/60">
      {icon && <span className="text-white/45">{icon}</span>}
      {children}
    </div>
  )
}

export function AppChip({ media }: { media: MediaState }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 truncate font-small text-[11px] text-white/60">
      <span className={cn("size-1.5 shrink-0 rounded-full", media.playing ? "bg-white" : "bg-white/35")} />
      <span className="truncate">{media.appName || "Media"}</span>
    </span>
  )
}

export function Progress({ media, interactive = true }: { media: MediaState; interactive?: boolean }) {
  const pos = useMediaPosition(media)
  const pct = media.durationMs ? (pos / media.durationMs) * 100 : 0
  const ref = useRef<HTMLDivElement>(null)
  if (!media.durationMs) return <div className="h-4" />
  return (
    <div className="flex items-center gap-2 font-small text-[10.5px] text-white/50">
      <span className="tabular w-8 text-right">{duration(pos)}</span>
      <div
        ref={ref}
        className={cn("group relative h-3.5 flex-1", interactive && media.canSeek && "cursor-pointer")}
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
      <span className="tabular w-8">-{duration(media.durationMs - pos)}</span>
    </div>
  )
}

export function Transport({ media, size = "md" }: { media: MediaState; size?: "md" | "lg" }) {
  const big = size === "lg"
  const btn = "grid place-items-center rounded-full text-white transition-[background-color,transform] active:scale-90 disabled:opacity-30"
  return (
    <div className={cn("flex items-center justify-center", big ? "gap-4" : "gap-2.5")}>
      <button
        className={cn(btn, big ? "size-9" : "size-7", "hover:bg-white/10")}
        disabled={!media.canPrevious}
        onClick={() => api.mediaCommand("previous")}
        aria-label="Previous"
      >
        <SkipBackIcon className={cn("fill-current", big ? "size-[18px]" : "size-3.5")} />
      </button>
      <button
        className={cn(btn, big ? "size-11 bg-white text-black hover:bg-white/90" : "size-9 bg-white/12 hover:bg-white/20")}
        disabled={!media.canPlayPause}
        onClick={() => api.mediaCommand("playPause")}
        aria-label={media.playing ? "Pause" : "Play"}
      >
        {media.playing ? (
          <PauseIcon className={cn("fill-current", big ? "size-[18px]" : "size-4")} />
        ) : (
          <PlayIcon className={cn("translate-x-px fill-current", big ? "size-[18px]" : "size-4")} />
        )}
      </button>
      <button
        className={cn(btn, big ? "size-9" : "size-7", "hover:bg-white/10")}
        disabled={!media.canNext}
        onClick={() => api.mediaCommand("next")}
        aria-label="Next"
      >
        <SkipForwardIcon className={cn("fill-current", big ? "size-[18px]" : "size-3.5")} />
      </button>
    </div>
  )
}

export function NothingPlaying({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-end">
      <div className="mb-auto pt-4 text-center">
        <div className="text-[13px] font-semibold text-white/90">Nothing playing</div>
        {!compact && (
          <div className="mx-auto mt-0.5 max-w-[240px] text-[12px] leading-snug text-white/50">
            Play something in Spotify, a browser or any media app and it shows up here.
          </div>
        )}
      </div>
      <PeekMascot className={compact ? "h-[78px] w-[122px]" : "h-[100px] w-[158px]"} />
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
      <AmbientArt src={media.artwork} opacity={0.5} />
      <div className="relative flex h-full flex-col justify-between gap-1.5 p-3">
        <div className="flex min-h-0 gap-3">
          <Artwork src={media.artwork} className="size-[112px]" rounded="rounded-[10px]" />
          <div className="flex min-w-0 flex-1 flex-col pt-0.5">
            <div className="flex items-center justify-between gap-2">
              <AppChip media={media} />
              <Visualizer playing={media.playing} mode={settings.visualizer} height={12} barWidth={2.5} />
            </div>
            <div className="mt-1.5 line-clamp-2 text-[14.5px] font-semibold leading-snug">{media.title || "Unknown title"}</div>
            <div className="truncate text-[12.5px] text-white/65">{media.artist}</div>
            {media.album && <div className="truncate text-[11.5px] text-white/40">{media.album}</div>}
          </div>
        </div>
        <div className="space-y-1">
          <Progress media={media} />
          <Transport media={media} />
        </div>
      </div>
    </Card>
  )
}

/** The search bar: ask the AI or search the web. */
export function AskBar({ settings, focusNonce }: { settings: Settings; focusNonce: number }) {
  const [value, setValue] = useState("")
  const input = useRef<HTMLInputElement>(null)
  const send = useChat((s) => s.send)
  const setTab = useIslandUi((s) => s.setTab)

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
      className="group flex h-9 shrink-0 items-center gap-2 rounded-card bg-white/[0.07] px-3 ring-1 ring-inset ring-white/[0.07] transition-[background-color,box-shadow] focus-within:bg-white/[0.1] focus-within:ring-white/25"
      onSubmit={(e) => {
        e.preventDefault()
        submit(!aiFirst)
      }}
    >
      <SearchIcon className="size-[15px] shrink-0 text-white/55" />
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
        placeholder={settings.featureAi ? "Ask a question or search the web" : "Search the web"}
        aria-label={settings.featureAi ? "Ask a question or search the web" : "Search the web"}
        className="selectable h-full min-w-0 flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-white/35"
        spellCheck={false}
        autoComplete="off"
      />
      <div className="flex items-center gap-1 font-small text-[10.5px] text-white/40">
        {settings.featureAi && (
          <span className="flex items-center gap-1">
            <Kbd>
              <CornerDownLeftIcon className="size-2.5" />
            </Kbd>
            {aiFirst ? "Ask" : "Web"}
            <Kbd>Ctrl ↵</Kbd>
            {aiFirst ? "Web" : "Ask"}
          </span>
        )}
        <button
          type="button"
          onClick={() => submit(true)}
          className="ml-1 grid size-6 place-items-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          title="Search the web"
          aria-label="Search the web"
        >
          <GlobeIcon className="size-3.5" />
        </button>
      </div>
    </form>
  )
}
