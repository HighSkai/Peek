import { useEffect, useState } from "react"
import { CheckIcon, KeyRoundIcon, LoaderCircleIcon, RefreshCwIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { api } from "@/lib/ipc"
import type { AiProvider, Settings } from "@/lib/types"
import { Choice, Pick, type PageProps } from "./pages"
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
          {exists ? "Saved in Windows Credential Manager." : "Stored in Windows Credential Manager, never in a file."}
          {link && (
            <>
              {" "}
              <button className="underline underline-offset-2" onClick={() => api.openUrl(link)}>
                Get a key
              </button>
            </>
          )}
          {error && <span className="block text-white/80">{error}</span>}
        </>
      }
    >
      <div className="flex gap-1.5">
        <div className="relative flex-1">
          <KeyRoundIcon className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-white/40" />
          <Input
            type="password"
            className="h-7 pl-7"
            placeholder={exists ? "Saved. Paste a new key to replace it" : "Paste your API key"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && value && save(value)}
            autoComplete="off"
            spellCheck={false}
            aria-label={label}
          />
        </div>
        <Button size="sm" onClick={() => save(value)} disabled={!value || saving}>
          {saving ? <LoaderCircleIcon className="animate-spin" /> : "Save"}
        </Button>
        {exists && (
          <Button size="sm" variant="outline" onClick={() => save("")} disabled={saving}>
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
      setStatus({ ok: true, text: list.length ? `Connected, ${list.length} models available` : "Connected, but no models were listed" })
    } catch (e) {
      setStatus({ ok: false, text: String(e) })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Group
      title={provider.name}
      footer={
        provider.kind === "ollama"
          ? "Install Ollama, then pull a model, for example: ollama pull llama3.2"
          : provider.id === "lmstudio"
            ? "In LM Studio, load a model and start the local server from the Developer tab."
            : undefined
      }
    >
      <Row label="Endpoint" stacked>
        <CommitInput className="h-7" value={provider.baseUrl} onCommit={(v) => patch({ baseUrl: v })} spellCheck={false} aria-label="Endpoint" />
      </Row>
      <Row label="Model" stacked description={status?.text}>
        <div className="flex gap-1.5">
          {models.length > 0 ? (
            <Select value={models.includes(provider.model) ? provider.model : undefined} onValueChange={(v) => patch({ model: v })}>
              <SelectTrigger size="sm" className="flex-1">
                <SelectValue placeholder={provider.model || "Choose a model"} />
              </SelectTrigger>
              <SelectContent className="max-h-56">
                {models.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <CommitInput
              className="h-7 flex-1"
              value={provider.model}
              placeholder="Model name"
              onCommit={(v) => patch({ model: v })}
              spellCheck={false}
              aria-label="Model"
            />
          )}
          <Button size="sm" variant="outline" onClick={fetchModels} disabled={loading}>
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
    <Page>
      <Group title="Assistant">
        <Row label="Provider" description="Local providers run on this PC. Nothing leaves your machine.">
          <Select value={s.aiProvider} onValueChange={(v) => set({ aiProvider: v })}>
            <SelectTrigger size="sm" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[...local, ...cloud].map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                  <span className="ml-auto font-small text-[10.5px] text-white/40">{p.local ? "Local" : "Cloud"}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <Row
          label="Plain answers"
          description="Asks the model to skip filler like “Great question!”, closing offers, em dashes and inflated words."
        >
          <Switch checked={s.aiPlainStyle} onCheckedChange={(v) => set({ aiPlainStyle: v })} />
        </Row>
        <Row label="Instructions" stacked description="Sent with every question as the system prompt.">
          <Textarea
            className="min-h-16"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onBlur={() => prompt !== s.aiSystemPrompt && set({ aiSystemPrompt: prompt })}
            aria-label="Instructions"
          />
        </Row>
      </Group>

      {provider && <ProviderEditor provider={provider} s={s} set={set} />}

      <Group title="Search bar">
        <Row label="Enter key" description="Ctrl+Enter does the other one.">
          <Choice
            value={s.enterAction}
            onChange={(v) => set({ enterAction: v })}
            options={[
              { value: "ai", label: "Ask AI" },
              { value: "web", label: "Search the web" },
            ]}
          />
        </Row>
        <Row label="Search engine" description="Opens results in your default browser.">
          <Pick className="w-36" value={s.searchEngine} onChange={(v) => set({ searchEngine: v })} options={ENGINES} />
        </Row>
        {s.searchEngine === "custom" && (
          <Row label="Search URL" stacked description="Use %s where the query goes.">
            <CommitInput
              className="h-7"
              value={s.searchCustomUrl}
              onCommit={(v) => set({ searchCustomUrl: v })}
              spellCheck={false}
              aria-label="Search URL"
            />
          </Row>
        )}
      </Group>

      <Group title="Web answers" footer="Peek searches first and gives the results to the model, so answers can cite current sources.">
        <Row label="Search provider">
          <Pick
            className="w-40"
            value={s.groundingProvider}
            onChange={(v) => set({ groundingProvider: v })}
            options={[
              { value: "none", label: "Off" },
              { value: "searxng", label: "SearXNG (self-hosted)" },
              { value: "brave", label: "Brave Search API" },
              { value: "tavily", label: "Tavily" },
            ]}
          />
        </Row>
        {s.groundingProvider === "searxng" && (
          <Row label="SearXNG URL" stacked description="The instance must allow JSON output (search.formats: json).">
            <CommitInput
              className="h-7"
              value={s.searxngUrl}
              onCommit={(v) => set({ searxngUrl: v })}
              spellCheck={false}
              aria-label="SearXNG URL"
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
              <div className="flex w-44 items-center gap-2.5">
                <Slider
                  value={[s.groundingResults]}
                  min={1}
                  max={10}
                  step={1}
                  onValueChange={([v]) => set({ groundingResults: v })}
                  aria-label="Results to read"
                />
                <SliderValue>{s.groundingResults}</SliderValue>
              </div>
            </Row>
            <Row label="Use web results by default" description="You can still switch Web on or off for each question.">
              <Switch checked={s.webResultsDefault} onCheckedChange={(v) => set({ webResultsDefault: v })} />
            </Row>
          </>
        )}
      </Group>
    </Page>
  )
}
