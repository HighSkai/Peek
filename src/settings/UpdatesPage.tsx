import { useEffect, useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { ArrowUpRightIcon, CheckIcon, DownloadIcon, RefreshCwIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { ProgressRing } from "@/island/widgets"
import { api } from "@/lib/ipc"
import { bytes } from "@/lib/format"
import { useUpdates } from "@/lib/store"
import type { PageProps } from "./pages"
import { Group, Page, Row } from "./ui"

const RELEASES = "https://github.com/HighSkai/Peek/releases"

function ago(t: number | null, now: number) {
  if (!t) return "Not yet"
  const s = Math.round((t - now) / 1000)
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })
  if (Math.abs(s) < 45) return "Just now"
  if (Math.abs(s) < 3600) return rtf.format(Math.round(s / 60), "minute")
  if (Math.abs(s) < 86400) return rtf.format(Math.round(s / 3600), "hour")
  return rtf.format(Math.round(s / 86400), "day")
}

export function UpdatesPage({ s, set }: PageProps) {
  const info = useUpdates((u) => u.info)
  const phase = useUpdates((u) => u.phase)
  const checkedAt = useUpdates((u) => u.checkedAt)
  const error = useUpdates((u) => u.error)
  const downloaded = useUpdates((u) => u.downloaded)
  const total = useUpdates((u) => u.total)
  const { check, install } = useUpdates.getState()
  const [version, setVersion] = useState<string>()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    api
      .systemInfo()
      .then((i) => setVersion(i.version))
      .catch(() => {})
    // Opening this page counts as a manual check if the last one is old.
    const last = useUpdates.getState().checkedAt
    if (!last || Date.now() - last > 10 * 60 * 1000) void check()
    const id = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [check])

  const current = info?.current ?? version ?? ""
  const busy = phase === "checking" || phase === "downloading" || phase === "installing"
  const pct = total > 0 ? Math.min(100, (downloaded / total) * 100) : 0

  return (
    <Page>
      <Group>
        <div className="flex items-center gap-3 p-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-full bg-white/[0.08] text-white/80">
            {phase === "checking" || phase === "installing" ? (
              <ProgressRing size={16} />
            ) : info?.available ? (
              <DownloadIcon className="size-4" />
            ) : (
              <CheckIcon className="size-4" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            {phase === "installing" ? (
              <>
                <div className="text-[13px] font-semibold">Installing Peek {info?.latest}</div>
                <div className="text-[11.5px] text-white/50">Peek will close and start again in a moment.</div>
              </>
            ) : phase === "downloading" ? (
              <>
                <div className="text-[13px] font-semibold">Downloading Peek {info?.latest}</div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/15">
                  <div className="h-full rounded-full bg-white transition-[width] duration-150" style={{ width: `${pct}%` }} />
                </div>
                <div className="tabular mt-1 font-small text-[11px] text-white/50">
                  {bytes(downloaded)} of {total ? bytes(total) : "unknown size"}
                </div>
              </>
            ) : phase === "checking" ? (
              <>
                <div className="text-[13px] font-semibold">Checking for updates</div>
                <div className="text-[11.5px] text-white/50">Looking at the latest release on GitHub.</div>
              </>
            ) : info?.available ? (
              <>
                <div className="text-[13px] font-semibold">Peek {info.latest} is available</div>
                <div className="text-[11.5px] text-white/50">
                  You have {current}.{info.downloadSize ? ` ${bytes(info.downloadSize)} download.` : ""} Peek restarts to
                  finish.
                </div>
              </>
            ) : (
              <>
                <div className="text-[13px] font-semibold">Peek is up to date</div>
                <div className="text-[11.5px] text-white/50">Version {current || "unknown"}</div>
              </>
            )}
            {error && phase !== "downloading" && (
              <div className="mt-1 break-words text-[11.5px] text-white/75">{error}</div>
            )}
          </div>
          {info?.available && phase !== "downloading" && phase !== "installing" && (
            <Button size="sm" onClick={() => void install()} disabled={busy}>
              {phase === "error" ? "Try again" : "Install and restart"}
            </Button>
          )}
        </div>
        <Row label="Last checked" description={ago(checkedAt, now)}>
          <Button variant="outline" size="sm" onClick={() => void check()} disabled={busy}>
            <RefreshCwIcon /> Check now
          </Button>
        </Row>
      </Group>

      <Group title="Automatic updates" footer="Peek only contacts GitHub to check. Downloads are checked against the release's SHA-256 before installing.">
        <Row label="Check for updates automatically" description="When Peek starts and every 6 hours.">
          <Switch checked={s.updateCheck} onCheckedChange={(v) => set({ updateCheck: v })} />
        </Row>
        <Row
          label="Install updates automatically"
          description="Downloads and installs while the island is closed, then restarts Peek. No installer to run."
        >
          <Switch
            checked={s.updateCheck && s.updateAutoInstall}
            disabled={!s.updateCheck}
            onCheckedChange={(v) => set({ updateAutoInstall: v })}
          />
        </Row>
      </Group>

      {info?.available && info.notes.trim() && (
        <Group title={`What's new in ${info.latest}`}>
          <div className="selectable markdown px-3 py-2.5 text-[12.5px] text-white/85">
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
              {info.notes}
            </ReactMarkdown>
          </div>
        </Group>
      )}

      <Group>
        <Row label="All releases and notes">
          <Button variant="ghost" size="sm" onClick={() => api.openUrl(info?.url ?? RELEASES)}>
            Open <ArrowUpRightIcon />
          </Button>
        </Row>
      </Group>
    </Page>
  )
}
