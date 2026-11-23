// Thin, typed layer over the Tauri IPC. Outside of Tauri (plain `npm run dev` in a
// browser) every call is served by a demo backend with sample data, which makes UI work
// possible without building the native app.

import { Channel, invoke, isTauri } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import type {
  AudioLevel,
  ChatEvent,
  ChatMessage,
  HardwareSnapshot,
  IslandCommand,
  MediaState,
  Settings,
  SystemInfo,
  UpdateInfo,
  VolumeState,
} from "./types"

export const inTauri = isTauri()

type DemoModule = typeof import("./demo")
let demoModule: Promise<DemoModule> | null = null
const demo = () => (demoModule ??= import("./demo"))

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (inTauri) return invoke<T>(cmd, args)
  return (await demo()).invoke(cmd, args) as Promise<T>
}

export const EVENTS = {
  settings: "settings://changed",
  hover: "island://hover",
  command: "island://command",
  hardware: "hardware://snapshot",
  media: "media://state",
  audio: "audio://level",
} as const

type EventPayloads = {
  [EVENTS.settings]: Settings
  [EVENTS.hover]: boolean
  [EVENTS.command]: IslandCommand
  [EVENTS.hardware]: HardwareSnapshot
  [EVENTS.media]: MediaState
  [EVENTS.audio]: AudioLevel
}

/** Subscribe to a backend event. Returns an unsubscribe function. */
export function on<E extends keyof EventPayloads>(event: E, handler: (payload: EventPayloads[E]) => void) {
  let unlisten: (() => void) | null = null
  let disposed = false
  const pending: Promise<() => void> = inTauri
    ? listen<EventPayloads[E]>(event, (e) => handler(e.payload))
    : demo().then((d) => d.listen(event, handler as (p: unknown) => void))
  pending.then((fn) => {
    if (disposed) fn()
    else unlisten = fn
  })
  return () => {
    disposed = true
    unlisten?.()
  }
}

export interface ChatRequest {
  requestId: string
  providerId?: string
  messages: ChatMessage[]
  useWeb: boolean
  localTime?: string
}

export const api = {
  getSettings: () => call<Settings>("get_settings"),
  updateSettings: (patch: Partial<Settings>) => call<Settings>("update_settings", { patch }),
  resetSettings: () => call<Settings>("reset_settings"),

  islandReady: () => call<void>("island_ready"),
  setHitRect: (r: { x: number; y: number; w: number; h: number }) => call<void>("island_set_hit_rect", r),
  setExpanded: (expanded: boolean, focus: boolean) => call<void>("island_set_expanded", { expanded, focus }),
  hideIsland: () => call<void>("island_hide"),
  listMonitors: () => call<string[]>("list_monitors"),

  hardwareSnapshot: () => call<HardwareSnapshot | null>("hardware_snapshot"),
  hardwareSetCompact: (active: boolean) => call<void>("hardware_set_compact", { active }),

  mediaState: () => call<MediaState>("media_state"),
  mediaCommand: (action: "playPause" | "next" | "previous" | "seek" | "shuffle" | "repeat", positionMs?: number) =>
    call<void>("media_command", { action, positionMs }),

  setMetering: (active: boolean) => call<void>("audio_set_metering", { active }),
  getVolume: () => call<VolumeState>("audio_get_volume"),
  setVolume: (level?: number, muted?: boolean) => call<VolumeState>("audio_set_volume", { level, muted }),

  aiChat: async (request: ChatRequest, onEvent: (e: ChatEvent) => void) => {
    if (inTauri) {
      const channel = new Channel<ChatEvent>()
      channel.onmessage = onEvent
      return invoke<void>("ai_chat", { request, onEvent: channel })
    }
    return (await demo()).chat(request, onEvent)
  },
  aiCancel: (requestId: string) => call<void>("ai_cancel", { requestId }),
  aiListModels: (providerId: string) => call<string[]>("ai_list_models", { providerId }),
  openWebSearch: (query: string) => call<void>("open_web_search", { query }),

  secretSet: (name: string, value: string) => call<void>("secret_set", { name, value }),
  secretExists: (name: string) => call<boolean>("secret_exists", { name }),

  /** Pause the global shortcut while a new one is being recorded. */
  suspendShortcut: (suspended: boolean) => call<void>("shortcut_suspend", { suspended }),

  checkForUpdates: () => call<UpdateInfo>("check_for_updates"),
  openUrl: (url: string) => call<void>("open_url", { url }),
  quit: () => call<void>("quit_app"),
  systemInfo: () => call<SystemInfo>("system_info"),
}

/** Subscribe to focus changes of the current window. */
export function onWindowFocus(handler: (focused: boolean) => void) {
  let unlisten: (() => void) | null = null
  let disposed = false
  if (inTauri) {
    import("@tauri-apps/api/window").then(({ getCurrentWindow }) =>
      getCurrentWindow()
        .onFocusChanged(({ payload }) => handler(payload))
        .then((fn) => {
          if (disposed) fn()
          else unlisten = fn
        }),
    )
  } else {
    const onBlur = () => handler(false)
    const onFocus = () => handler(true)
    window.addEventListener("blur", onBlur)
    window.addEventListener("focus", onFocus)
    unlisten = () => {
      window.removeEventListener("blur", onBlur)
      window.removeEventListener("focus", onFocus)
    }
  }
  return () => {
    disposed = true
    unlisten?.()
  }
}
