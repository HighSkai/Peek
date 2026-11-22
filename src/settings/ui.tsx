import { cn } from "@/lib/utils"

export function Page({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[680px] px-8 pb-12 pt-7">
      <h1 className="text-[22px] font-semibold tracking-tight">{title}</h1>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      <div className="mt-6 space-y-6">{children}</div>
    </div>
  )
}

export function Group({ title, children, footer }: { title?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <section>
      {title && <h2 className="mb-2 px-1 text-[13px] font-semibold text-foreground/80">{title}</h2>}
      <div className="divide-y divide-border overflow-hidden rounded-xl border bg-[var(--panel)] shadow-xs backdrop-blur-sm">
        {children}
      </div>
      {footer && <p className="mt-2 px-1 text-xs leading-relaxed text-muted-foreground">{footer}</p>}
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
    <div className={cn("flex gap-4 px-4 py-3.5", stacked ? "flex-col" : "items-center justify-between", className)}>
      <div className="min-w-0">
        <label htmlFor={htmlFor} className="text-sm font-medium leading-none">
          {label}
        </label>
        {description && <p className="mt-1.5 text-[13px] leading-snug text-muted-foreground">{description}</p>}
      </div>
      {children && <div className={cn(stacked ? "w-full" : "shrink-0")}>{children}</div>}
    </div>
  )
}

export function SliderValue({ children }: { children: React.ReactNode }) {
  return <span className="tabular w-14 shrink-0 text-right text-[13px] text-muted-foreground">{children}</span>
}
