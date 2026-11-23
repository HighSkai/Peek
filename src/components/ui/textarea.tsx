import * as React from "react"
import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "selectable flex field-sizing-content min-h-16 w-full rounded-ctl bg-white/[0.06] px-2.5 py-1.5 text-[12.5px] leading-snug text-foreground ring-1 ring-inset ring-white/10 transition-[box-shadow,background-color] outline-none placeholder:text-white/35 focus-visible:bg-white/[0.08] focus-visible:ring-white/30 disabled:cursor-not-allowed disabled:opacity-50 scrollbar-thin",
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
