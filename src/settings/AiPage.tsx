import { useEffect, useState } from "react"
import { CheckIcon, KeyRoundIcon, LoaderCircleIcon, RefreshCwIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { api } from "@/lib/ipc"
import type { AiProvider, Settings } from "@/lib/types"
import type { PageProps } from "./pages"
import { Group, Page, Row, SliderValue } from "./ui"

const ENGINES = [
  { value: "google", label: "Google" },
  { value: "bing", label: "Bing" },
  { value: "duckduckgo", label: "DuckDuckGo" },
  { value: "brave", label: "Brave Search" },
  { value: "startpage", label: "Startpage" },
  { value: "kagi", label: "Kagi" },
  { value: "perplexity", label: "Perplexity" },
  { value: "custom", label: "Custom URL" },
]

const KEY_LINKS: Record<string, string> = {
  openai: "https://platform.openai.com/api-keys",
  anthropic: "https://console.anthropic.com/settings/keys",
  gemini: "https://aistudio.google.com/apikey",
  openrouter: "https://openrouter.ai/keys",
  groq: "https://console.groq.com/keys",
}

/** Text input that saves when it loses focus or Enter is pressed. */
function CommitInput({
  value,
  onCommit,
  ...props
}: Omit<React.ComponentProps<typeof Input>, "value" | "onChange"> & { value: string; onCommit: (v: string) => void }) {
  const [local, setLocal] = useState(value)
  useEffect(() => setLocal(value), [value])
  return (
    <Input
      {...props}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => local !== value && onCommit(local.trim())}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur()
      }}
    />
  )
}

function SecretField({ name, label, link }: { name: string; label: string; link?: string }) {
  const [exists, setExists] = useState<boolean | null>(null)
  const [value, setValue] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setValue("")
    setError(null)
    api.secretExists(name).then(setExists).catch(() => setExists(false))
  }, [name])

  const save = async (v: string) => {
    setSaving(true)
    setError(null)
    try {
      await api.secretSet(name, v)
      setExists(v.trim().length > 0)
      setValue("")
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Row
      stacked
      label={label}
      description={
        <>
          {exists ? "Saved securely in Windows Credential Manager." : "Stored in Windows Credential Manager, never in a file."}
          {link && (
            <>
              {" "}
              <button className="underline underline-offset-2" onClick={() => api.openUrl(link)}>
                Get a key
              </button>
            </>
          )}
          {error && <span className="block text-foreground">{error}</span>}
        </>
      }
    >
      <div className="flex gap-2">
        <div className="relative flex-1">
          <KeyRoundIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="password"
            className="bg-background/50 pl-8"
            placeholder={exists ? "••••••••••••  (saved)" : "Paste your API key"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && value && save(value)}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <Button onClick={() => save(value)} disabled={!value || saving}>
          {saving ? <LoaderCircleIcon className="animate-spin" /> : "Save"}
        </Button>
        {exists && (
          <Button variant="outline" onClick={() => save("")} disabled={saving}>
            Remove
          </Button>
        )}
      </div>
    </Row>
  )
}

function ProviderEditor({ provider, s, set }: { provider: AiProvider; s: Settings; set: PageProps["set"] }) {
  const [models, setModels] = useState<string[]>([])
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setModels([])
    setStatus(null)
  }, [provider.id])

  const patch = (p: Partial<AiProvider>) =>
    set({ aiProviders: s.aiProviders.map((x) => (x.id === provider.id ? { ...x, ...p } : x)) })

  const fetchModels = async () => {
    setLoading(true)
    setStatus(null)
    try {
      const list = await api.aiListModels(provider.id)
      setModels(list)
      setStatus({ ok: true, text: list.length ? `Connected · ${list.length} models available` : "Connected, but no models were listed" })
    } catch (e) {
      setStatus({ ok: false, text: String(e) })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Group
      title={`${provider.name} settings`}
      footer={
        provider.kind === "ollama"
          ? "Install Ollama, then pull a model, for example: ollama pull llama3.2"
          : provider.id === "lmstudio"
            ? "In LM Studio, load a model and start the local server (Developer tab)."
            : undefined
      }
    >
      <Row label="Endpoint" stacked>
        <CommitInput className="bg-background/50 font-mono text-[13px]" value={provider.baseUrl} onCommit={(v) => patch({ baseUrl: v })} spellCheck={false} />
      </Row>
      <Row label="Model" stacked description={status?.text}>
        <div className="flex gap-2">
          {models.length > 0 ? (
            <Select value={models.includes(provider.model) ? provider.model : undefined} onValueChange={(v) => patch({ model: v })}>
              <SelectTrigger className="flex-1 bg-background/50">
                <SelectValue placeholder={provider.model || "Choose a model"} />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {models.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <CommitInput
              className="flex-1 bg-background/50 font-mono text-[13px]"
              value={provider.model}
              placeholder="model name"
              onCommit={(v) => patch({ model: v })}
              spellCheck={false}
            />
          )}
          <Button variant="outline" onClick={fetchModels} disabled={loading}>
            {loading ? <LoaderCircleIcon className="animate-spin" /> : status?.ok ? <CheckIcon /> : <RefreshCwIcon />}
            {models.length ? "Refresh" : "Load models"}
          </Button>
        </div>
      </Row>
      {(provider.needsKey || provider.id === "custom" || provider.id === "lmstudio") && (
        <SecretField
          name={`ai:${provider.id}`}
          label={provider.needsKey ? "API key" : "API key (optional)"}
          link={KEY_LINKS[provider.id]}
        />
      )}
    </Group>
  )
}

export function AiPage({ s, set }: PageProps) {
  const provider = s.aiProviders.find((p) => p.id === s.aiProvider) ?? s.aiProviders[0]
  const [prompt, setPrompt] = useState(s.aiSystemPrompt)
  useEffect(() => setPrompt(s.aiSystemPrompt), [s.aiSystemPrompt])
  const local = s.aiProviders.filter((p) => p.local)
  const cloud = s.aiProviders.filter((p) => !p.local)

  return (
    <Page title="AI & Search" description="Pick a local model or a cloud provider, and how the search bar handles the web.">
      <Group title="Assistant">
        <Row label="Provider" description="Local providers run on this PC; nothing leaves your machine.">
          <Select value={s.aiProvider} onValueChange={(v) => set({ aiProvider: v })}>
            <SelectTrigger className="w-60 bg-background/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[...local, ...cloud].map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                  <Badge variant="secondary" className="ml-auto h-4 px-1.5 text-[10px]">
                    {p.local ? "Local" : "Cloud"}
                  </Badge>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <Row label="Instructions" stacked description="Sent with every question as the system prompt.">
          <Textarea
            className="min-h-20 bg-background/50 text-[13px]"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onBlur={() => prompt !== s.aiSystemPrompt && set({ aiSystemPrompt: prompt })}
          />
        </Row>
      </Group>

      {provider && <ProviderEditor provider={provider} s={s} set={set} />}

      <Group title="Search bar">
        <Row label="Enter key" description="Ctrl+Enter does the other one.">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={s.enterAction}
            onValueChange={(v) => v && set({ enterAction: v as Settings["enterAction"] })}
            className="bg-background/50"
          >
            <ToggleGroupItem value="ai" className="px-3 text-[13px]">
              Ask AI
            </ToggleGroupItem>
            <ToggleGroupItem value="web" className="px-3 text-[13px]">
              Search the web
            </ToggleGroupItem>
          </ToggleGroup>
        </Row>
        <Row label="Search engine" description="Opens results in your default browser.">
          <Select value={s.searchEngine} onValueChange={(v) => set({ searchEngine: v })}>
            <SelectTrigger className="w-48 bg-background/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ENGINES.map((e) => (
                <SelectItem key={e.value} value={e.value}>
                  {e.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        {s.searchEngine === "custom" && (
          <Row label="Search URL" stacked description="Use %s where the query goes.">
            <CommitInput
              className="bg-background/50 font-mono text-[13px]"
              value={s.searchCustomUrl}
              onCommit={(v) => set({ searchCustomUrl: v })}
              spellCheck={false}
            />
          </Row>
        )}
      </Group>

      <Group
        title="Web answers"
        footer="When enabled, Peek searches first and gives the results to the model so answers can cite current sources."
      >
        <Row label="Search provider">
          <Select value={s.groundingProvider} onValueChange={(v) => set({ groundingProvider: v as Settings["groundingProvider"] })}>
            <SelectTrigger className="w-48 bg-background/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Off</SelectItem>
              <SelectItem value="searxng">SearXNG (self-hosted)</SelectItem>
              <SelectItem value="brave">Brave Search API</SelectItem>
              <SelectItem value="tavily">Tavily</SelectItem>
            </SelectContent>
          </Select>
        </Row>
        {s.groundingProvider === "searxng" && (
          <Row label="SearXNG URL" stacked description="The instance must allow JSON output (search.formats: json).">
            <CommitInput
              className="bg-background/50 font-mono text-[13px]"
              value={s.searxngUrl}
              onCommit={(v) => set({ searxngUrl: v })}
              spellCheck={false}
            />
          </Row>
        )}
        {s.groundingProvider === "brave" && (
          <SecretField name="search:brave" label="Brave Search API key" link="https://api-dashboard.search.brave.com/" />
        )}
        {s.groundingProvider === "tavily" && <SecretField name="search:tavily" label="Tavily API key" link="https://app.tavily.com/" />}
        {s.groundingProvider !== "none" && (
          <>
            <Row label="Results to read">
              <div className="flex w-56 items-center gap-3">
                <Slider
                  value={[s.groundingResults]}
                  min={1}
                  max={10}
                  step={1}
                  onValueChange={([v]) => set({ groundingResults: v })}
                />
                <SliderValue>{s.groundingResults}</SliderValue>
              </div>
            </Row>
            <Row label="Use web results by default" description="You can still toggle Web for each question in the Ask tab.">
              <Switch checked={s.webResultsDefault} onCheckedChange={(v) => set({ webResultsDefault: v })} />
            </Row>
          </>
        )}
      </Group>
    </Page>
  )
}
