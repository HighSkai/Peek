import * as React from "react"
import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "selectable h-8 w-full min-w-0 rounded-ctl bg-white/[0.06] px-2.5 text-[12.5px] text-foreground ring-1 ring-inset ring-white/10 transition-[box-shadow,background-color] outline-none placeholder:text-white/35 disabled:pointer-events-none disabled:opacity-50",
        "focus-visible:bg-white/[0.08] focus-visible:ring-white/30",
        className,
      )}
      {...props}
    />
  )
}

export { Input }
