import { memo, useEffect, useLayoutEffect, useRef, useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { motion } from "motion/react"
import {
  ArrowUpIcon,
  CheckIcon,
  CircleAlertIcon,
  CopyIcon,
  GlobeIcon,
  PlusIcon,
  SquareIcon,
} from "lucide-react"
import { PeekMascot } from "@/components/peek-mascot"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { api } from "@/lib/ipc"
import { hostname } from "@/lib/format"
import { useChat, useSettings, type ChatEntry } from "@/lib/store"
import type { Settings } from "@/lib/types"
import { cn } from "@/lib/utils"

const SUGGESTIONS = [
  "Explain this error message: ",
  "Write a PowerShell one-liner that ",
  "Summarize the pros and cons of ",
]

export function AskTab({ settings, searchNonce }: { settings: Settings; searchNonce: number }) {
  const entries = useChat((s) => s.entries)
  const busy = useChat((s) => s.busy)
  const useWebPref = useChat((s) => s.useWeb)
  const { send, stop, reset, setUseWeb } = useChat.getState()
  const update = useSettings((s) => s.update)

  const [draft, setDraft] = useState("")
  const input = useRef<HTMLTextAreaElement>(null)
  const viewport = useRef<HTMLDivElement>(null)
  const pinnedToBottom = useRef(true)

  const provider = settings.aiProviders.find((p) => p.id === settings.aiProvider)
  const groundingOn = settings.groundingProvider !== "none"
  const useWeb = groundingOn && (useWebPref ?? settings.webResultsDefault)

  useEffect(() => {
    requestAnimationFrame(() => input.current?.focus())
  }, [searchNonce])

  // Grow the textarea with its content (up to 5 lines).
  useLayoutEffect(() => {
    const el = input.current
    if (!el) return
    el.style.height = "0px"
    el.style.height = `${Math.min(el.scrollHeight, 112)}px`
  }, [draft])

  // Stick to the bottom while streaming unless the user scrolled up.
  useEffect(() => {
    const el = viewport.current
    if (el && pinnedToBottom.current) el.scrollTop = el.scrollHeight
  }, [entries])

  const submit = () => {
    const text = draft.trim()
    if (!text || busy) return
    pinnedToBottom.current = true
    send(text)
    setDraft("")
  }

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex h-11 shrink-0 items-center gap-2 px-3">
        <Select value={settings.aiProvider} onValueChange={(v) => update({ aiProvider: v })}>
          <SelectTrigger
            size="sm"
            className="h-7 max-w-[260px] gap-1.5 rounded-full border-0 bg-white/[0.08] px-3 text-[12px] text-white/85 shadow-none hover:bg-white/[0.12] focus-visible:ring-white/20 [&_svg]:text-white/50"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" className="dark max-h-64 rounded-xl border-white/10 bg-[#161616] text-white">
            {settings.aiProviders.map((p) => (
              <SelectItem key={p.id} value={p.id} className="rounded-lg text-[12.5px] focus:bg-white/10 focus:text-white">
                <span>{p.name}</span>
                {p.model && <span className="text-white/40">{p.model}</span>}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {groundingOn && (
          <button
            onClick={() => setUseWeb(!useWeb)}
            aria-pressed={useWeb}
            title="Use web results"
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium transition",
              useWeb ? "bg-white text-black" : "bg-white/[0.08] text-white/70 hover:bg-white/[0.12]",
            )}
          >
            <GlobeIcon className="size-3.5" /> Web
          </button>
        )}
        <div className="flex-1" />
        {entries.length > 0 && (
          <button
            onClick={reset}
            className="flex h-7 items-center gap-1 rounded-full px-2.5 text-[12px] text-white/60 transition hover:bg-white/10 hover:text-white"
          >
            <PlusIcon className="size-3.5" /> New chat
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="relative min-h-0 flex-1">
        {entries.length === 0 ? (
          <EmptyState providerName={provider?.name} model={provider?.model} onPick={(s) => {
            setDraft(s)
            requestAnimationFrame(() => input.current?.focus())
          }} />
        ) : (
          <ScrollArea
            className="h-full"
            viewportRef={viewport}
            onViewportScroll={(el) => {
              pinnedToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
            }}
          >
            <div className="space-y-3 px-4 pb-3 pt-1">
              {entries.map((e) => (
                <Message key={e.id} entry={e} />
              ))}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Composer */}
      <div className="shrink-0 p-2.5 pt-1">
        <div className="flex items-end gap-2 rounded-2xl bg-white/[0.07] p-1.5 pl-3.5 ring-1 ring-inset ring-white/[0.08] transition focus-within:bg-white/[0.1] focus-within:ring-white/20">
          <textarea
            ref={input}
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault()
                if (draft.trim()) api.openWebSearch(draft.trim())
              } else if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
            placeholder={`Message ${provider?.name ?? "Peek"}…`}
            className="selectable max-h-28 min-h-[30px] flex-1 resize-none bg-transparent py-1.5 text-[13.5px] leading-snug text-white outline-none placeholder:text-white/35 scrollbar-thin"
            spellCheck={false}
          />
          <button
            onClick={() => draft.trim() && api.openWebSearch(draft.trim())}
            title="Search the web (Ctrl+Enter)"
            aria-label="Search the web"
            className="grid size-8 shrink-0 place-items-center rounded-full text-white/55 transition hover:bg-white/10 hover:text-white"
          >
            <GlobeIcon className="size-4" />
          </button>
          {busy ? (
            <button
              onClick={stop}
              aria-label="Stop"
              title="Stop"
              className="grid size-8 shrink-0 place-items-center rounded-full bg-white text-black transition hover:bg-white/90"
            >
              <SquareIcon className="size-3 fill-current" />
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={!draft.trim()}
              aria-label="Send"
              title="Send (Enter)"
              className="grid size-8 shrink-0 place-items-center rounded-full bg-white text-black transition hover:bg-white/90 disabled:bg-white/15 disabled:text-white/40"
            >
              <ArrowUpIcon className="size-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function EmptyState({ providerName, model, onPick }: { providerName?: string; model?: string; onPick: (s: string) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-end">
      <div className="mb-auto flex flex-col items-center pt-3 text-center">
        <div className="text-[15px] font-semibold">Ask Peek anything</div>
        <div className="mt-0.5 text-[12px] text-white/45">
          {providerName ? (
            <>
              Using {providerName}
              {model ? ` · ${model}` : ""}
            </>
          ) : (
            "Choose a provider in Settings"
          )}
        </div>
        <div className="mt-3 flex flex-wrap justify-center gap-1.5 px-6">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => onPick(s)}
              className="rounded-full bg-white/[0.07] px-3 py-1 text-[12px] text-white/70 ring-1 ring-inset ring-white/[0.06] transition hover:bg-white/[0.12] hover:text-white"
            >
              {s.replace(/[: ]+$/, "")}…
            </button>
          ))}
        </div>
      </div>
      <PeekMascot className="h-[92px] w-[150px]" />
    </div>
  )
}

const Message = memo(function Message({ entry }: { entry: ChatEntry }) {
  const [copied, setCopied] = useState(false)
  if (entry.role === "user") {
    return (
      <motion.div className="flex justify-end" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
        <div className="selectable max-w-[82%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-white px-3.5 py-2 text-[13.5px] leading-snug text-black">
          {entry.content}
        </div>
      </motion.div>
    )
  }
  return (
    <motion.div className="group max-w-full" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
      {entry.sources && entry.sources.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {entry.sources.map((s, i) => (
            <button
              key={s.url}
              onClick={() => api.openUrl(s.url)}
              title={s.title}
              className="flex max-w-[200px] items-center gap-1.5 rounded-full bg-white/[0.07] px-2 py-0.5 text-[11px] text-white/65 transition hover:bg-white/[0.12] hover:text-white"
            >
              <span className="tabular grid size-4 place-items-center rounded-full bg-white/15 text-[9.5px] font-semibold">{i + 1}</span>
              <span className="truncate">{hostname(s.url)}</span>
            </button>
          ))}
        </div>
      )}
      {entry.status && !entry.content && <div className="shimmer-text text-[13px] font-medium">{entry.status}</div>}
      {entry.content && (
        <div className={cn("selectable markdown text-[13.5px] text-white/90", entry.streaming && "streaming-caret")}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              a: ({ href, children }) => (
                <a
                  href={href}
                  onClick={(e) => {
                    e.preventDefault()
                    if (href) api.openUrl(href)
                  }}
                >
                  {children}
                </a>
              ),
            }}
          >
            {entry.content}
          </ReactMarkdown>
        </div>
      )}
      {entry.error && (
        <div className="mt-1 flex items-start gap-2.5 rounded-xl bg-white/[0.06] p-3 text-[12.5px] leading-snug text-white/80 ring-1 ring-inset ring-white/10">
          <CircleAlertIcon className="mt-0.5 size-4 shrink-0 text-white/60" />
          <div className="min-w-0 flex-1">
            <div className="selectable break-words">{entry.error}</div>
            <button
              onClick={() => api.openSettings()}
              className="mt-2 rounded-full bg-white/10 px-2.5 py-1 text-[11.5px] font-medium text-white transition hover:bg-white/20"
            >
              Open AI settings
            </button>
          </div>
        </div>
      )}
      {!entry.streaming && entry.content && (
        <div className="mt-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={() => {
              navigator.clipboard.writeText(entry.content)
              setCopied(true)
              setTimeout(() => setCopied(false), 1400)
            }}
            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-white/45 transition hover:bg-white/10 hover:text-white"
          >
            {copied ? <CheckIcon className="size-3" /> : <CopyIcon className="size-3" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}
    </motion.div>
  )
})
