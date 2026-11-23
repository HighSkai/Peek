import { cn } from "@/lib/utils"

// Building blocks for the settings pages inside the open island, styled after the
// Windows 11 Settings app: grouped rows with the label on the left, control on the right.

export function Page({ children }: { children: React.ReactNode }) {
  return <div className="space-y-3 pb-3 pr-2 pt-0.5">{children}</div>
}

export function Group({ title, children, footer }: { title?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <section>
      {title && <h3 className="mb-1 px-1 text-[12px] font-semibold text-white/70">{title}</h3>}
      <div className="divide-y divide-white/[0.06] overflow-hidden rounded-card bg-white/[0.055]">{children}</div>
      {footer && <p className="mt-1 px-1 text-[11.5px] leading-snug text-white/45">{footer}</p>}
    </section>
  )
}

export function Row({
  label,
  description,
  children,
  htmlFor,
  stacked = false,
  className,
}: {
  label: React.ReactNode
  description?: React.ReactNode
  children?: React.ReactNode
  htmlFor?: string
  stacked?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex px-3 py-2",
        stacked ? "flex-col gap-1.5" : "min-h-[40px] items-center justify-between gap-3",
        className,
      )}
    >
      <div className="min-w-0">
        <label htmlFor={htmlFor} className="block text-[12.5px] leading-tight text-white/90">
          {label}
        </label>
        {description && <p className="mt-0.5 text-[11.5px] leading-snug text-white/45">{description}</p>}
      </div>
      {children && <div className={cn(stacked ? "w-full" : "shrink-0")}>{children}</div>}
    </div>
  )
}

export function SliderValue({ children }: { children: React.ReactNode }) {
  return <span className="tabular w-12 shrink-0 text-right font-small text-[11.5px] text-white/55">{children}</span>
}
