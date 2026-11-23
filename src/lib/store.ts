import { create } from "zustand"
import { api, EVENTS, on } from "./ipc"
import { localTimeString } from "./format"
import type { AudioLevel, HardwareSnapshot, MediaState, Settings, Source, Tab, UpdateInfo } from "./types"

// ---------------------------------------------------------------------------
// Island UI: the open tab and the settings page, shared so any part of the
// dashboard can jump to a section.
// ---------------------------------------------------------------------------

export type SettingsPage =
  | "general"
  | "appearance"
  | "position"
  | "motion"
  | "features"
  | "ai"
  | "updates"
  | "about"

interface IslandUi {
  tab: Tab
  /** Tab to return to when settings close. */
  lastTab: Tab
  settingsPage: SettingsPage
  setTab: (tab: Tab) => void
  openSettings: (page?: SettingsPage) => void
  closeSettings: () => void
  setSettingsPage: (page: SettingsPage) => void
}

export const useIslandUi = create<IslandUi>((set, get) => ({
  tab: "home",
  lastTab: "home",
  settingsPage: "general",
  setTab: (tab) => set((s) => ({ tab, lastTab: s.tab === "settings" ? s.lastTab : s.tab })),
  openSettings: (page) =>
    set((s) => ({
      tab: "settings",
      lastTab: s.tab === "settings" ? s.lastTab : s.tab,
      settingsPage: page ?? s.settingsPage,
    })),
  closeSettings: () => set({ tab: get().lastTab === "settings" ? "home" : get().lastTab }),
  setSettingsPage: (page) => set({ settingsPage: page }),
}))

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

interface SettingsStore {
  settings: Settings | null
  error: string | null
  update: (patch: Partial<Settings>) => Promise<void>
}

export const useSettings = create<SettingsStore>((set) => ({
  settings: null,
  error: null,
  update: async (patch) => {
    // Optimistic update so sliders and switches feel instant.
    set((s) => (s.settings ? { settings: { ...s.settings, ...patch }, error: null } : s))
    try {
      const next = await api.updateSettings(patch)
      set({ settings: next, error: null })
    } catch (e) {
      set({ error: String(e) })
      set({ settings: await api.getSettings() })
      throw e
    }
  },
}))

let settingsStarted = false
export function startSettingsSync() {
  if (settingsStarted) return
  settingsStarted = true
  api.getSettings().then((settings) => useSettings.setState({ settings }))
  on(EVENTS.settings, (settings) => useSettings.setState({ settings }))
}

// ---------------------------------------------------------------------------
// Updates
// ---------------------------------------------------------------------------

export type UpdatePhase = "idle" | "checking" | "downloading" | "installing" | "error"

interface UpdatesStore {
  info: UpdateInfo | null
  phase: UpdatePhase
  checkedAt: number | null
  error: string | null
  downloaded: number
  total: number
  check: () => Promise<UpdateInfo | null>
  install: () => Promise<void>
}

export const useUpdates = create<UpdatesStore>((set, get) => ({
  info: null,
  phase: "idle",
  checkedAt: null,
  error: null,
  downloaded: 0,
  total: 0,
  check: async () => {
    const phase = get().phase
    if (phase === "checking" || phase === "downloading" || phase === "installing") return get().info
    set({ phase: "checking", error: null })
    try {
      const info = await api.checkForUpdates()
      set({ info, phase: "idle", checkedAt: Date.now() })
      return info
    } catch (e) {
      set({ phase: "idle", error: String(e), checkedAt: Date.now() })
      return null
    }
  },
  install: async () => {
    if (get().phase === "downloading" || get().phase === "installing") return
    set({ phase: "downloading", error: null, downloaded: 0, total: get().info?.downloadSize ?? 0 })
    try {
      await api.installUpdate((ev) => {
        if (ev.type === "progress") set({ downloaded: ev.downloaded, total: ev.total })
        else set({ phase: "installing" })
      })
    } catch (e) {
      set({ phase: "error", error: String(e) })
    }
  },
}))

// ---------------------------------------------------------------------------
// Hardware
// ---------------------------------------------------------------------------

const HISTORY = 60

export interface HardwareHistory {
  cpu: number[]
  gpu: number[]
  ram: number[]
  rx: number[]
  tx: number[]
}

interface HardwareStore {
  snapshot: HardwareSnapshot | null
  history: HardwareHistory
}

const push = (arr: number[], v: number) => {
  const next = arr.length >= HISTORY ? arr.slice(arr.length - HISTORY + 1) : arr.slice()
  next.push(v)
  return next
}

export const useHardware = create<HardwareStore>(() => ({
  snapshot: null,
  history: { cpu: [], gpu: [], ram: [], rx: [], tx: [] },
}))

let hardwareStarted = false
export function startHardwareSync() {
  if (hardwareStarted) return
  hardwareStarted = true
  api.hardwareSnapshot().then((snapshot) => snapshot && useHardware.setState({ snapshot }))
  on(EVENTS.hardware, (snapshot) =>
    useHardware.setState((s) => ({
      snapshot,
      history: {
        cpu: push(s.history.cpu, snapshot.cpu.usage),
        gpu: push(s.history.gpu, snapshot.gpus[0]?.usage ?? 0),
        ram: push(s.history.ram, snapshot.memory.total ? (snapshot.memory.used / snapshot.memory.total) * 100 : 0),
        rx: push(s.history.rx, snapshot.network.rxBps),
        tx: push(s.history.tx, snapshot.network.txBps),
      },
    })),
  )
}

// ---------------------------------------------------------------------------
// Media + audio level
// ---------------------------------------------------------------------------

interface MediaStore {
  media: MediaState | null
  /** Increments every time a different track starts. */
  trackChanges: number
}

export const useMedia = create<MediaStore>(() => ({ media: null, trackChanges: 0 }))

const trackKey = (m: MediaState | null) => (m && m.available ? `${m.appId}|${m.title}|${m.artist}` : "")

let mediaStarted = false
export function startMediaSync() {
  if (mediaStarted) return
  mediaStarted = true
  const apply = (media: MediaState) =>
    useMedia.setState((s) => {
      const changed = trackKey(media) !== trackKey(s.media) && !!media.title && s.media !== null
      return { media, trackChanges: s.trackChanges + (changed ? 1 : 0) }
    })
  api.mediaState().then((m) => useMedia.setState({ media: m }))
  on(EVENTS.media, apply)
}

/** Current playback position, extrapolated from the last timeline update. */
export function mediaPosition(m: MediaState, now = Date.now()) {
  if (!m.durationMs) return 0
  let pos = m.positionMs
  if (m.playing) pos += Math.max(0, now - m.positionUpdatedAt) * (m.playbackRate || 1)
  return Math.min(pos, m.durationMs)
}

export const useAudioLevel = create<{ level: AudioLevel | null }>(() => ({ level: null }))

let audioStarted = false
export function startAudioSync() {
  if (audioStarted) return
  audioStarted = true
  on(EVENTS.audio, (level) => useAudioLevel.setState({ level }))
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export interface ChatEntry {
  id: string
  role: "user" | "assistant"
  content: string
  sources?: Source[]
  status?: string
  error?: string
  streaming?: boolean
}

interface ChatStore {
  entries: ChatEntry[]
  busy: boolean
  requestId: string | null
  useWeb: boolean | null
  providerId: string | null
  send: (text: string) => Promise<void>
  stop: () => void
  reset: () => void
  setUseWeb: (v: boolean) => void
  setProvider: (id: string | null) => void
}

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36)

export const useChat = create<ChatStore>((set, get) => ({
  entries: [],
  busy: false,
  requestId: null,
  useWeb: null,
  providerId: null,
  setUseWeb: (v) => set({ useWeb: v }),
  setProvider: (id) => set({ providerId: id }),
  reset: () => {
    get().stop()
    set({ entries: [], busy: false, requestId: null })
  },
  stop: () => {
    const id = get().requestId
    if (id) api.aiCancel(id)
  },
  send: async (text) => {
    const content = text.trim()
    if (!content || get().busy) return
    const settings = useSettings.getState().settings
    const requestId = uid()
    const assistantId = uid()
    const history = get()
      .entries.filter((e) => !e.error && e.content)
      .map((e) => ({ role: e.role, content: e.content }))
    set((s) => ({
      busy: true,
      requestId,
      entries: [
        ...s.entries,
        { id: uid(), role: "user", content },
        { id: assistantId, role: "assistant", content: "", streaming: true, status: "Thinking…" },
      ],
    }))
    const patch = (fn: (e: ChatEntry) => ChatEntry) =>
      set((s) => ({ entries: s.entries.map((e) => (e.id === assistantId ? fn(e) : e)) }))

    const useWeb = (get().useWeb ?? settings?.webResultsDefault ?? false) && settings?.groundingProvider !== "none"
    try {
      await api.aiChat(
        {
          requestId,
          providerId: get().providerId ?? undefined,
          messages: [...history, { role: "user", content }],
          useWeb,
          localTime: localTimeString(),
        },
        (ev) => {
          switch (ev.type) {
            case "status":
              patch((e) => ({ ...e, status: ev.message || undefined }))
              break
            case "sources":
              patch((e) => ({ ...e, sources: ev.sources }))
              break
            case "delta":
              patch((e) => ({ ...e, content: e.content + ev.text, status: undefined }))
              break
            case "error":
              patch((e) => ({ ...e, error: ev.message, streaming: false, status: undefined }))
              set({ busy: false, requestId: null })
              break
            case "done":
              patch((e) => ({ ...e, streaming: false, status: undefined }))
              set({ busy: false, requestId: null })
              break
          }
        },
      )
    } catch (err) {
      patch((e) => ({ ...e, error: String(err), streaming: false, status: undefined }))
      set({ busy: false, requestId: null })
    }
  },
}))
