import { useEffect, useState } from "react"
import { mediaPosition } from "@/lib/store"
import type { MediaState } from "@/lib/types"

/** Current time, refreshed on an interval aligned to the next tick. */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    let id: number
    const tick = () => {
      setNow(new Date())
      id = window.setTimeout(tick, intervalMs - (Date.now() % intervalMs) + 5)
    }
    id = window.setTimeout(tick, intervalMs - (Date.now() % intervalMs) + 5)
    return () => window.clearTimeout(id)
  }, [intervalMs])
  return now
}

/** Playback position that advances smoothly while playing. */
export function useMediaPosition(media: MediaState | null, active = true) {
  const [pos, setPos] = useState(() => (media ? mediaPosition(media) : 0))
  useEffect(() => {
    if (!media) return
    setPos(mediaPosition(media))
    if (!media.playing || !active) return
    const id = window.setInterval(() => setPos(mediaPosition(media)), 250)
    return () => window.clearInterval(id)
  }, [media, active])
  return pos
}
