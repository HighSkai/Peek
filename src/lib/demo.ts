// Demo backend used when the UI runs in a regular browser (`npm run dev`) instead of
// inside Tauri. It mimics the native commands and events with sample data so the
// interface can be developed and previewed without building the app.
//
// Query parameters:
//   ?expanded=1&tab=home|system|media|ask|settings
//   &page=general|appearance|position|motion|features|ai|about   (settings page)
//   &mode=notch|island        &style=solid|glass
//   &density=regular|compact  &reveal=always|hotkey
//   &idle=eyes|clock|stats|none
//   &prompt=...               send a question to the (fake) assistant
//   &media=0                  nothing playing      &playing=0   paused
//   &banner=1                 announce a new track shortly after loading
//   &update=1                 pretend a newer release is available
//   &motion=system|full|reduced|off

import type { ChatRequest } from "./ipc"
import type { ChatEvent, HardwareSnapshot, MediaState, Settings, UpdateEvent } from "./types"

const params = new URLSearchParams(location.search)

type Handler = (payload: unknown) => void
const listeners = new Map<string, Set<Handler>>()

function emit(event: string, payload: unknown) {
  listeners.get(event)?.forEach((h) => h(payload))
}

export function listen(event: string, handler: Handler) {
  if (!listeners.has(event)) listeners.set(event, new Set())
  listeners.get(event)!.add(handler)
  return () => listeners.get(event)?.delete(handler)
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

let settings: Settings = {
  launchAtLogin: false,
  showOnStartup: true,
  hideInFullscreen: true,
  collapseOnBlur: true,
  expandOnHover: false,
  hoverDelayMs: 350,
  shortcut: "Alt+Shift+Space",
  defaultTab: "home",
  reveal: (params.get("reveal") as Settings["reveal"]) ?? "always",
  mode: (params.get("mode") as Settings["mode"]) ?? "island",
  style: (params.get("style") as Settings["style"]) ?? "solid",
  glassOpacity: 0.82,
  density: (params.get("density") as Settings["density"]) ?? "regular",
  islandSize: "medium",
  dashboardSize: "medium",
  idleContent: (params.get("idle") as Settings["idleContent"]) ?? "eyes",
  showMediaActivity: true,
  mediaToast: true,
  visualizer: "audio",
  clock24h: false,
  monitor: "",
  offsetX: 0,
  offsetY: 10,
  motion: (params.get("motion") as Settings["motion"]) ?? "system",
  animationSpeed: 1,
  springBounce: 0.15,
  hoverEffect: true,
  featureMedia: true,
  featureHardware: true,
  featureAi: true,
  hardwareIntervalMs: 1000,
  temperatureUnit: "c",
  aiProvider: "ollama",
  aiProviders: [
    { id: "ollama", name: "Ollama", kind: "ollama", baseUrl: "http://127.0.0.1:11434", model: "llama3.2", needsKey: false, local: true },
    { id: "lmstudio", name: "LM Studio", kind: "openai", baseUrl: "http://127.0.0.1:1234/v1", model: "", needsKey: false, local: true },
    { id: "openai", name: "OpenAI", kind: "openai", baseUrl: "https://api.openai.com/v1", model: "gpt-5-mini", needsKey: true, local: false },
    { id: "anthropic", name: "Anthropic", kind: "anthropic", baseUrl: "https://api.anthropic.com/v1", model: "claude-haiku-5-5", needsKey: true, local: false },
    { id: "gemini", name: "Google Gemini", kind: "gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta", model: "gemini-2.5-flash", needsKey: true, local: false },
    { id: "openrouter", name: "OpenRouter", kind: "openai", baseUrl: "https://openrouter.ai/api/v1", model: "openrouter/auto", needsKey: true, local: false },
    { id: "groq", name: "Groq", kind: "openai", baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile", needsKey: true, local: false },
    { id: "custom", name: "Custom (OpenAI-compatible)", kind: "openai", baseUrl: "http://127.0.0.1:8080/v1", model: "", needsKey: false, local: true },
  ],
  aiSystemPrompt:
    "You are Peek, an assistant built into a small panel at the top of a Windows desktop. Answer clearly and briefly. Use Markdown only when it helps.",
  aiPlainStyle: true,
  enterAction: "ai",
  searchEngine: "google",
  searchCustomUrl: "https://www.google.com/search?q=%s",
  groundingProvider: "searxng",
  searxngUrl: "http://127.0.0.1:8888",
  groundingResults: 5,
  webResultsDefault: false,
  updateCheck: true,
  updateAutoInstall: false,
}

// ---------------------------------------------------------------------------
// Hardware
// ---------------------------------------------------------------------------

const walk = (v: number, min: number, max: number, step: number) =>
  Math.min(max, Math.max(min, v + (Math.random() - 0.5) * step))

let cpu = 18
let gpu = 34
let ram = 0.46
let cores = Array.from({ length: 16 }, () => 10 + Math.random() * 30)
let cpuTemp = 54
let gpuTemp = 61
let rx = 2_400_000
let tx = 310_000
const started = Date.now()

function snapshot(): HardwareSnapshot {
  cpu = walk(cpu, 4, 72, 10)
  gpu = walk(gpu, 2, 96, 14)
  ram = walk(ram, 0.38, 0.62, 0.01)
  cores = cores.map((c) => walk(c, 1, 100, 22))
  cpuTemp = walk(cpuTemp, 42, 78, 3)
  gpuTemp = walk(gpuTemp, 45, 79, 2.5)
  rx = Math.max(20_000, walk(rx, 0, 9_000_000, 2_400_000))
  tx = Math.max(8_000, walk(tx, 0, 1_200_000, 300_000))
  const total = 32 * 1024 ** 3
  return {
    timestamp: Date.now(),
    cpu: {
      name: "AMD Ryzen 7 7800X3D 8-Core Processor",
      usage: cpu,
      perCore: cores,
      frequencyMhz: 4850 + Math.round(Math.random() * 200),
      physicalCores: 8,
      logicalCores: 16,
      temperature: cpuTemp,
      powerWatts: 38 + cpu * 0.6,
    },
    memory: { used: total * ram, total, swapUsed: 1.2 * 1024 ** 3, swapTotal: 8 * 1024 ** 3 },
    gpus: [
      {
        name: "NVIDIA GeForce RTX 4070 SUPER",
        vendor: "NVIDIA",
        usage: gpu,
        memoryUsed: 4.1 * 1024 ** 3 + gpu * 30 * 1024 ** 2,
        memoryTotal: 12 * 1024 ** 3,
        temperature: gpuTemp,
        hotspotTemperature: null,
        fanPercent: Math.round(30 + gpu * 0.35),
        fanRpm: null,
        powerWatts: 28 + gpu * 1.7,
        clockMhz: 2475,
      },
    ],
    disks: [
      { name: "System", mount: "C:\\", used: 612 * 1024 ** 3, total: 1000 * 1024 ** 3, readBps: Math.random() * 4e6, writeBps: Math.random() * 2e6, removable: false },
      { name: "Games", mount: "D:\\", used: 1.41 * 1024 ** 4, total: 2 * 1024 ** 4, readBps: Math.random() * 1e6, writeBps: 0, removable: false },
    ],
    network: { rxBps: rx, txBps: tx, rxTotal: 8.2 * 1024 ** 3, txTotal: 0.9 * 1024 ** 3 },
    temperatures: [
      { hardware: "AMD Ryzen 7 7800X3D", name: "Core (Tctl/Tdie)", value: cpuTemp },
      { hardware: "AMD Ryzen 7 7800X3D", name: "CCD1 (Tdie)", value: cpuTemp - 3 },
      { hardware: "NVIDIA GeForce RTX 4070 SUPER", name: "GPU Core", value: gpuTemp },
      { hardware: "Samsung SSD 990 PRO 1TB", name: "Composite Temperature", value: 41 },
      { hardware: "Nuvoton NCT6799D", name: "System", value: 33 },
    ],
    fans: [
      { hardware: "Nuvoton NCT6799D", name: "CPU Fan", value: 820 + cpu * 9 },
      { hardware: "Nuvoton NCT6799D", name: "Pump", value: 2400 },
      { hardware: "Nuvoton NCT6799D", name: "System Fan #1", value: 690 },
      { hardware: "Nuvoton NCT6799D", name: "System Fan #2", value: 710 },
    ],
    battery: null,
    uptimeSecs: 3 * 3600 + 1240 + Math.floor((Date.now() - started) / 1000),
    sensorSource: "LibreHardwareMonitor",
  }
}

let latestHardware = snapshot()
// &static=1 freezes the stats, for screenshots.
if (params.get("static") !== "1") {
  setInterval(() => {
    latestHardware = snapshot()
    emit("hardware://snapshot", latestHardware)
  }, 1000)
}

// ---------------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------------

function artwork(hue: number) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hue},80%,62%)"/>
      <stop offset="1" stop-color="hsl(${(hue + 60) % 360},75%,32%)"/>
    </linearGradient>
    <radialGradient id="s" cx="0.3" cy="0.25" r="0.8">
      <stop offset="0" stop-color="#fff" stop-opacity=".55"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="300" height="300" fill="url(#g)"/>
  <circle cx="210" cy="200" r="120" fill="hsl(${(hue + 200) % 360},70%,20%)" opacity=".55"/>
  <circle cx="95" cy="90" r="70" fill="url(#s)"/>
  <path d="M0 230 Q75 190 150 230 T300 230 V300 H0Z" fill="#000" opacity=".25"/>
</svg>`
  return `data:image/svg+xml;base64,${btoa(svg)}`
}

const tracks = [
  { title: "Midnight Drive", artist: "Neon Avenue", album: "Afterglow", durationMs: 214_000, hue: 280 },
  { title: "Paper Planes", artist: "The Quiet Hours", album: "Small Rooms", durationMs: 187_000, hue: 18 },
  { title: "Low Tide", artist: "Saltwater Static", album: "Coastlines", durationMs: 241_000, hue: 190 },
]
let trackIndex = 0
let media: MediaState = makeMedia(params.get("media") !== "0")

function makeMedia(available: boolean): MediaState {
  const t = tracks[trackIndex]
  if (!available)
    return {
      available: false, appId: "", appName: "", title: "", artist: "", album: "", artwork: null, playing: false,
      positionMs: 0, durationMs: 0, positionUpdatedAt: Date.now(), playbackRate: 1, canPlayPause: false,
      canNext: false, canPrevious: false, canSeek: false, shuffle: null, repeat: null,
    }
  return {
    available: true,
    appId: "Microsoft.ZuneMusic_8wekyb3d8bbwe!Microsoft.ZuneMusic",
    appName: "Media Player",
    title: t.title,
    artist: t.artist,
    album: t.album,
    artwork: artwork(t.hue),
    playing: params.get("playing") !== "0",
    positionMs: 72_000,
    durationMs: t.durationMs,
    positionUpdatedAt: Date.now(),
    playbackRate: 1,
    canPlayPause: true,
    canNext: true,
    canPrevious: true,
    canSeek: true,
    shuffle: false,
    repeat: "none",
  }
}

function position() {
  return media.playing ? media.positionMs + (Date.now() - media.positionUpdatedAt) : media.positionMs
}

function setTrack(i: number) {
  trackIndex = (i + tracks.length) % tracks.length
  media = { ...makeMedia(true), positionMs: 0 }
  emit("media://state", media)
}

if (params.get("banner") === "1") setTimeout(() => setTrack(1), 1200)

let volume = { level: 0.42, muted: false }
let metering = false
let phase = 0
setInterval(() => {
  if (!metering) return
  phase += 0.35
  const beat = media.playing ? Math.abs(Math.sin(phase)) * 0.6 + Math.random() * 0.35 : 0
  emit("audio://level", { peak: beat, left: beat, right: beat * 0.9, volume: volume.level, muted: volume.muted })
}, 40)

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

const CANNED = `The Dynamic Island is the pill-shaped cutout at the top of recent iPhones. iOS draws live content around it:

- music, timers and calls show up at a glance
- a tap or long press opens it into a larger panel

Peek does the same on Windows 11. The island at the top of your screen opens into a dashboard for media, system stats and short questions like this one.`

export async function chat(request: ChatRequest, onEvent: (e: ChatEvent) => void) {
  let cancelled = false
  cancels.set(request.requestId, () => (cancelled = true))
  await sleep(500)
  if (request.useWeb) {
    onEvent({ type: "status", message: "Searching the web…" })
    await sleep(600)
    onEvent({
      type: "sources",
      sources: [
        { title: "Dynamic Island - Wikipedia", url: "https://en.wikipedia.org/wiki/Dynamic_Island", snippet: "" },
        { title: "Use the Dynamic Island on your iPhone", url: "https://support.apple.com/guide/iphone/", snippet: "" },
      ],
    })
  }
  onEvent({ type: "status", message: "" })
  const words = CANNED.split(/(?<=\s)/)
  for (const w of words) {
    if (cancelled) break
    onEvent({ type: "delta", text: w })
    await sleep(18 + Math.random() * 30)
  }
  onEvent({ type: "done" })
}

const cancels = new Map<string, () => void>()
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ---------------------------------------------------------------------------
// Updates
// ---------------------------------------------------------------------------

const VERSION = "0.3.0"
const NEWER = "0.3.1"
const demoUpdate = params.get("update") === "1"

function updateInfo() {
  return {
    current: VERSION,
    latest: demoUpdate ? NEWER : VERSION,
    url: "https://github.com/HighSkai/Peek/releases",
    available: demoUpdate,
    notes: demoUpdate
      ? "### Fixes\n\n- The track banner no longer flickers when a playlist starts.\n- Live stats keep their place when a GPU sleeps.\n\n### Changes\n\n- Ask remembers the last provider you picked."
      : "",
    publishedAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
    downloadSize: demoUpdate ? 2_240_000 : null,
  }
}

export async function installUpdate(onEvent: (e: UpdateEvent) => void) {
  const total = 2_240_000
  for (let d = 0; d <= total; d += 160_000) {
    onEvent({ type: "progress", downloaded: Math.min(d, total), total })
    await sleep(120)
  }
  onEvent({ type: "installing" })
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

export async function invoke(cmd: string, args: Record<string, unknown> = {}): Promise<unknown> {
  switch (cmd) {
    case "get_settings":
      return settings
    case "update_settings":
      settings = { ...settings, ...(args.patch as Partial<Settings>) }
      emit("settings://changed", settings)
      return settings
    case "reset_settings":
      return settings
    case "island_ready": {
      const expanded = params.get("expanded") === "1"
      if (expanded) {
        setTimeout(
          () => emit("island://command", { action: "expand", tab: params.get("tab") ?? "home", focusSearch: false }),
          150,
        )
      }
      return
    }
    case "shortcut_suspend":
      return
    case "hardware_snapshot":
      return latestHardware
    case "media_state":
      return media
    case "media_command": {
      const action = args.action as string
      if (action === "playPause") {
        media = { ...media, positionMs: position(), positionUpdatedAt: Date.now(), playing: !media.playing }
      } else if (action === "next") setTrack(trackIndex + 1)
      else if (action === "previous") setTrack(trackIndex - 1)
      else if (action === "seek") media = { ...media, positionMs: Number(args.positionMs ?? 0), positionUpdatedAt: Date.now() }
      else if (action === "shuffle") media = { ...media, shuffle: !media.shuffle }
      else if (action === "repeat")
        media = { ...media, repeat: media.repeat === "none" ? "list" : media.repeat === "list" ? "track" : "none" }
      emit("media://state", media)
      return
    }
    case "audio_set_metering":
      metering = Boolean(args.active)
      return
    case "audio_get_volume":
      return volume
    case "audio_set_volume":
      volume = {
        level: (args.level as number | undefined) ?? volume.level,
        muted: (args.muted as boolean | undefined) ?? volume.muted,
      }
      return volume
    case "ai_cancel":
      cancels.get(args.requestId as string)?.()
      return
    case "ai_list_models":
      return ["llama3.2", "qwen2.5:7b", "mistral-nemo", "gemma3:4b"]
    case "secret_exists":
      return false
    case "list_monitors":
      return ["\\\\.\\DISPLAY1", "\\\\.\\DISPLAY2"]
    case "check_for_updates":
      await sleep(600)
      return updateInfo()
    case "system_info":
      return { version: VERSION, mica: false, osBuild: 26100 }
    case "open_url":
    case "open_web_search":
      window.open(
        cmd === "open_url" ? String(args.url) : `https://www.google.com/search?q=${encodeURIComponent(String(args.query))}`,
        "_blank",
      )
      return
    default:
      return
  }
}
