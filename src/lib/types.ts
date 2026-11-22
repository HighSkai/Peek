// Mirrors the Rust types in src-tauri/src. Keep in sync.

export type IslandMode = "notch" | "island"
export type SizePreset = "small" | "medium" | "large"
export type ProviderKind = "ollama" | "openai" | "anthropic" | "gemini"
export type Tab = "home" | "system" | "media" | "ask"

export interface AiProvider {
  id: string
  name: string
  kind: ProviderKind
  baseUrl: string
  model: string
  needsKey: boolean
  local: boolean
}

export interface Settings {
  launchAtLogin: boolean
  showOnStartup: boolean
  hideInFullscreen: boolean
  collapseOnBlur: boolean
  expandOnHover: boolean
  hoverDelayMs: number
  shortcut: string
  defaultTab: Tab

  mode: IslandMode
  style: "solid" | "glass"
  glassOpacity: number
  islandSize: SizePreset
  dashboardSize: SizePreset
  idleContent: "eyes" | "clock" | "stats" | "none"
  showMediaActivity: boolean
  mediaToast: boolean
  visualizer: "audio" | "animated" | "off"
  theme: "system" | "dark" | "light"
  clock24h: boolean

  monitor: string
  offsetX: number
  offsetY: number

  animations: boolean
  animationSpeed: number
  bounce: number
  hoverEffect: boolean

  featureMedia: boolean
  featureHardware: boolean
  featureAi: boolean
  hardwareIntervalMs: number
  temperatureUnit: "c" | "f"

  aiProvider: string
  aiProviders: AiProvider[]
  aiSystemPrompt: string
  enterAction: "ai" | "web"
  searchEngine: string
  searchCustomUrl: string
  groundingProvider: "none" | "searxng" | "brave" | "tavily"
  searxngUrl: string
  groundingResults: number
  webResultsDefault: boolean
}

export interface CpuInfo {
  name: string
  usage: number
  perCore: number[]
  frequencyMhz: number
  physicalCores: number
  logicalCores: number
  temperature: number | null
  powerWatts: number | null
}

export interface MemoryInfo {
  used: number
  total: number
  swapUsed: number
  swapTotal: number
}

export interface GpuInfo {
  name: string
  vendor: string
  usage: number | null
  memoryUsed: number | null
  memoryTotal: number | null
  temperature: number | null
  hotspotTemperature: number | null
  fanPercent: number | null
  fanRpm: number | null
  powerWatts: number | null
  clockMhz: number | null
}

export interface DiskInfo {
  name: string
  mount: string
  used: number
  total: number
  readBps: number
  writeBps: number
  removable: boolean
}

export interface SensorReading {
  hardware: string
  name: string
  value: number
}

export interface BatteryInfo {
  percent: number
  charging: boolean
  pluggedIn: boolean
  secondsLeft: number | null
}

export interface HardwareSnapshot {
  timestamp: number
  cpu: CpuInfo
  memory: MemoryInfo
  gpus: GpuInfo[]
  disks: DiskInfo[]
  network: { rxBps: number; txBps: number; rxTotal: number; txTotal: number }
  temperatures: SensorReading[]
  fans: SensorReading[]
  battery: BatteryInfo | null
  uptimeSecs: number
  sensorSource: string | null
}

export interface MediaState {
  available: boolean
  appId: string
  appName: string
  title: string
  artist: string
  album: string
  artwork: string | null
  playing: boolean
  positionMs: number
  durationMs: number
  positionUpdatedAt: number
  playbackRate: number
  canPlayPause: boolean
  canNext: boolean
  canPrevious: boolean
  canSeek: boolean
  shuffle: boolean | null
  repeat: "none" | "track" | "list" | null
}

export interface AudioLevel {
  peak: number
  left: number
  right: number
  volume: number
  muted: boolean
}

export interface VolumeState {
  level: number
  muted: boolean
}

export interface Source {
  title: string
  url: string
  snippet: string
}

export type ChatEvent =
  | { type: "status"; message: string }
  | { type: "sources"; sources: Source[] }
  | { type: "delta"; text: string }
  | { type: "done" }
  | { type: "error"; message: string }

export interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

export interface IslandCommand {
  action: "toggle" | "expand" | "collapse"
  tab: Tab | null
  focusSearch: boolean
}

export interface UpdateInfo {
  current: string
  latest: string
  url: string
  available: boolean
}

export interface SystemInfo {
  version: string
  mica: boolean
  osBuild: number
}
