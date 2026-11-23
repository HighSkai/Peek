import { memo, useEffect, useLayoutEffect, useRef, useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { motion } from "motion/react"
import { ArrowUpIcon, CheckIcon, CircleAlertIcon, CopyIcon, GlobeIcon, PlusIcon, SquareIcon } from "lucide-react"
import { PeekMascot } from "@/components/peek-mascot"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { api } from "@/lib/ipc"
import { hostname } from "@/lib/format"
import { useChat, useIslandUi, useSettings, type ChatEntry } from "@/lib/store"
import type { Settings } from "@/lib/types"
import { cn } from "@/lib/utils"
import { Kbd, ProgressRing } from "../widgets"

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
    el.style.height = `${Math.min(el.scrollHeight, 100)}px`
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
      <div className="flex h-8 shrink-0 items-center gap-1.5 px-1">
        <Select value={settings.aiProvider} onValueChange={(v) => update({ aiProvider: v })}>
          <SelectTrigger size="sm" className="h-6 max-w-[240px] rounded-full px-2.5 text-[11.5px] ring-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-60">
            {settings.aiProviders.map((p) => (
              <SelectItem key={p.id} value={p.id}>
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
              "flex h-6 items-center gap-1 rounded-full px-2.5 text-[11.5px] font-medium transition-colors",
              useWeb ? "bg-white text-black" : "bg-white/[0.06] text-white/70 hover:bg-white/[0.1]",
            )}
          >
            <GlobeIcon className="size-3" /> Web
          </button>
        )}
        <div className="flex-1" />
        {entries.length > 0 && (
          <button
            onClick={reset}
            className="flex h-6 items-center gap-1 rounded-full px-2 text-[11.5px] text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          >
            <PlusIcon className="size-3" /> New chat
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="relative min-h-0 flex-1">
        {entries.length === 0 ? (
          <EmptyState providerName={provider?.name} model={provider?.model} />
        ) : (
          <ScrollArea
            className="h-full"
            viewportRef={viewport}
            onViewportScroll={(el) => {
              pinnedToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
            }}
          >
            <div className="space-y-2.5 px-2 pb-2 pt-1">
              {entries.map((e) => (
                <Message key={e.id} entry={e} />
              ))}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Composer */}
      <div className="shrink-0 pt-1">
        <div className="flex items-end gap-1.5 rounded-card bg-white/[0.07] p-1 pl-3 ring-1 ring-inset ring-white/[0.07] transition-[background-color,box-shadow] focus-within:bg-white/[0.1] focus-within:ring-white/25">
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
            placeholder={`Message ${provider?.name ?? "Peek"}`}
            aria-label="Message"
            className="selectable max-h-[100px] min-h-[28px] flex-1 resize-none bg-transparent py-1 text-[13px] leading-snug text-white outline-none placeholder:text-white/35 scrollbar-thin"
            spellCheck={false}
          />
          <button
            onClick={() => draft.trim() && api.openWebSearch(draft.trim())}
            title="Search the web (Ctrl+Enter)"
            aria-label="Search the web"
            className="grid size-7 shrink-0 place-items-center rounded-full text-white/55 transition-colors hover:bg-white/10 hover:text-white"
          >
            <GlobeIcon className="size-3.5" />
          </button>
          {busy ? (
            <button
              onClick={stop}
              aria-label="Stop"
              title="Stop"
              className="grid size-7 shrink-0 place-items-center rounded-full bg-white text-black transition-colors hover:bg-white/90"
            >
              <SquareIcon className="size-2.5 fill-current" />
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={!draft.trim()}
              aria-label="Send"
              title="Send (Enter)"
              className="grid size-7 shrink-0 place-items-center rounded-full bg-white text-black transition-colors hover:bg-white/90 disabled:bg-white/15 disabled:text-white/40"
            >
              <ArrowUpIcon className="size-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function EmptyState({ providerName, model }: { providerName?: string; model?: string }) {
  const openSettings = useIslandUi((s) => s.openSettings)
  return (
    <div className="flex h-full flex-col items-center justify-end">
      <div className="mb-auto flex flex-col items-center pt-4 text-center">
        <div className="text-[13.5px] font-semibold">Ask Peek</div>
        <div className="mt-0.5 text-[12px] text-white/50">
          {providerName ? (
            <>
              {providerName}
              {model ? `, ${model}` : ""}
            </>
          ) : (
            <button className="underline underline-offset-2" onClick={() => openSettings("ai")}>
              Choose a provider
            </button>
          )}
        </div>
        <div className="mt-2 flex items-center gap-1 font-small text-[10.5px] text-white/40">
          <Kbd>↵</Kbd> send <span className="mx-1" /> <Kbd>Shift ↵</Kbd> new line <span className="mx-1" /> <Kbd>Ctrl ↵</Kbd> web search
        </div>
      </div>
      <PeekMascot className="h-[76px] w-[122px]" />
    </div>
  )
}

const Message = memo(function Message({ entry }: { entry: ChatEntry }) {
  const [copied, setCopied] = useState(false)
  const openSettings = useIslandUi((s) => s.openSettings)
  if (entry.role === "user") {
    return (
      <motion.div className="flex justify-end" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
        <div className="selectable max-w-[82%] whitespace-pre-wrap rounded-card rounded-br-[4px] bg-white px-3 py-1.5 text-[13px] leading-snug text-black">
          {entry.content}
        </div>
      </motion.div>
    )
  }
  return (
    <motion.div className="group max-w-full" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
      {entry.sources && entry.sources.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1">
          {entry.sources.map((s, i) => (
            <button
              key={s.url}
              onClick={() => api.openUrl(s.url)}
              title={s.title}
              className="flex max-w-[190px] items-center gap-1 rounded-full bg-white/[0.07] py-0.5 pl-0.5 pr-2 font-small text-[11px] text-white/65 transition-colors hover:bg-white/[0.12] hover:text-white"
            >
              <span className="tabular grid size-4 place-items-center rounded-full bg-white/15 text-[9.5px] font-semibold">{i + 1}</span>
              <span className="truncate">{hostname(s.url)}</span>
            </button>
          ))}
        </div>
      )}
      {entry.status && !entry.content && (
        <div className="flex items-center gap-2 text-[12.5px] text-white/60">
          <ProgressRing size={13} /> {entry.status.replace(/…$/, "")}
        </div>
      )}
      {entry.content && (
        <div className={cn("selectable markdown text-[13px] text-white/90", entry.streaming && "streaming-caret")}>
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
        <div className="mt-1 flex items-start gap-2 rounded-card bg-white/[0.06] p-2.5 text-[12px] leading-snug text-white/80">
          <CircleAlertIcon className="mt-0.5 size-3.5 shrink-0 text-white/60" />
          <div className="min-w-0 flex-1">
            <div className="selectable break-words">{entry.error}</div>
            <button
              onClick={() => openSettings("ai")}
              className="mt-1.5 rounded-full bg-white/10 px-2.5 py-0.5 text-[11.5px] font-medium text-white transition-colors hover:bg-white/20"
            >
              Open AI settings
            </button>
          </div>
        </div>
      )}
      {!entry.streaming && entry.content && (
        <div className="mt-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <button
            onClick={() => {
              navigator.clipboard.writeText(entry.content)
              setCopied(true)
              setTimeout(() => setCopied(false), 1400)
            }}
            className="flex items-center gap-1 rounded-[5px] px-1.5 py-0.5 font-small text-[11px] text-white/45 transition-colors hover:bg-white/10 hover:text-white"
          >
            {copied ? <CheckIcon className="size-3" /> : <CopyIcon className="size-3" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}
    </motion.div>
  )
})
