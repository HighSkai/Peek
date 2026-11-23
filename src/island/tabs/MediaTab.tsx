import { useEffect, useState } from "react"
import { Repeat1Icon, RepeatIcon, ShuffleIcon, Volume1Icon, Volume2Icon, VolumeXIcon } from "lucide-react"
import { Slider } from "@/components/ui/slider"
import { api } from "@/lib/ipc"
import { duration } from "@/lib/format"
import { useAudioLevel, useMedia } from "@/lib/store"
import type { Settings, VolumeState } from "@/lib/types"
import { cn } from "@/lib/utils"
import { useMediaPosition } from "../hooks"
import { AmbientArt, Artwork, Visualizer } from "../widgets"
import { AppChip, NothingPlaying, Transport } from "./parts"

export function MediaTab({ settings }: { settings: Settings }) {
  const media = useMedia((s) => s.media)
  const pos = useMediaPosition(media)
  const [scrub, setScrub] = useState<number | null>(null)

  if (!media?.available) return <NothingPlaying />

  const shown = scrub ?? pos
  return (
    <div className="relative h-full overflow-hidden rounded-card">
      <AmbientArt src={media.artwork} opacity={0.55} />
      <div className="relative flex h-full items-center gap-4 px-4">
        <Artwork src={media.artwork} className="aspect-square h-[min(86%,180px)]" rounded="rounded-card" />
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2">
              <AppChip media={media} />
              <Visualizer playing={media.playing} mode={settings.visualizer} height={12} barWidth={2.5} />
            </div>
            <div className="truncate text-[17px] font-semibold leading-tight">{media.title || "Unknown title"}</div>
            <div className="mt-0.5 truncate text-[12.5px] text-white/60">
              {media.artist}
              {media.album && <span className="text-white/40"> · {media.album}</span>}
            </div>
          </div>

          {media.durationMs > 0 && (
            <div>
              <Slider
                value={[shown]}
                max={media.durationMs}
                step={1000}
                disabled={!media.canSeek}
                onValueChange={([v]) => setScrub(v)}
                onValueCommit={([v]) => {
                  api.mediaCommand("seek", v)
                  setTimeout(() => setScrub(null), 600)
                }}
                aria-label="Seek"
              />
              <div className="tabular mt-0.5 flex justify-between font-small text-[10.5px] text-white/45">
                <span>{duration(shown)}</span>
                <span>-{duration(media.durationMs - shown)}</span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <ToggleButton
              label="Shuffle"
              active={!!media.shuffle}
              disabled={media.shuffle == null}
              onClick={() => api.mediaCommand("shuffle")}
            >
              <ShuffleIcon className="size-[15px]" />
            </ToggleButton>
            <Transport media={media} size="lg" />
            <ToggleButton
              label="Repeat"
              active={media.repeat != null && media.repeat !== "none"}
              disabled={media.repeat == null}
              onClick={() => api.mediaCommand("repeat")}
            >
              {media.repeat === "track" ? <Repeat1Icon className="size-[15px]" /> : <RepeatIcon className="size-[15px]" />}
            </ToggleButton>
          </div>

          <VolumeRow />
        </div>
      </div>
    </div>
  )
}

function ToggleButton({
  children,
  label,
  active,
  disabled,
  onClick,
}: {
  children: React.ReactNode
  label: string
  active: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "grid size-8 place-items-center rounded-full transition-colors disabled:opacity-25",
        active ? "bg-white/15 text-white" : "text-white/55 hover:bg-white/10 hover:text-white",
      )}
    >
      {children}
    </button>
  )
}

function VolumeRow() {
  const [volume, setVolume] = useState<VolumeState | null>(null)
  const [dragging, setDragging] = useState(false)
  const live = useAudioLevel((s) => s.level)

  useEffect(() => {
    api.getVolume().then(setVolume).catch(() => setVolume(null))
  }, [])

  // Follow changes made elsewhere (keyboard volume keys, the Windows flyout).
  useEffect(() => {
    if (live && !dragging) setVolume({ level: live.volume, muted: live.muted })
  }, [live, dragging])

  if (!volume) return null
  const Icon = volume.muted || volume.level === 0 ? VolumeXIcon : volume.level < 0.5 ? Volume1Icon : Volume2Icon
  return (
    <div className="flex items-center gap-2.5">
      <button
        className="grid size-6 shrink-0 place-items-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white"
        onClick={() => api.setVolume(undefined, !volume.muted).then(setVolume)}
        aria-label={volume.muted ? "Unmute" : "Mute"}
        title={volume.muted ? "Unmute" : "Mute"}
      >
        <Icon className="size-[15px]" />
      </button>
      <Slider
        value={[Math.round(volume.level * 100)]}
        max={100}
        step={1}
        onValueChange={([v]) => {
          setDragging(true)
          setVolume({ level: v / 100, muted: false })
          api.setVolume(v / 100, false)
        }}
        onValueCommit={() => setDragging(false)}
        aria-label="Volume"
      />
      <span className="tabular w-7 text-right font-small text-[10.5px] text-white/45">{Math.round(volume.level * 100)}</span>
    </div>
  )
}
