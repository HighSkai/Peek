import * as React from "react"
import { cn } from "@/lib/utils"
import { Switch as SwitchPrimitive } from "radix-ui"

/** Windows-style toggle switch: outlined when off, filled when on. */
function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer group/switch inline-flex h-[18px] w-[34px] shrink-0 items-center rounded-full px-[3px] ring-1 ring-inset transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-45",
        "data-[state=unchecked]:bg-transparent data-[state=unchecked]:ring-white/45 data-[state=unchecked]:hover:bg-white/[0.06]",
        "data-[state=checked]:bg-white data-[state=checked]:ring-white",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-3 rounded-full transition-[transform,background-color,width] duration-150 ease-out group-active/switch:w-[15px] data-[state=checked]:translate-x-4 data-[state=checked]:bg-black data-[state=checked]:group-active/switch:translate-x-[13px] data-[state=unchecked]:translate-x-0 data-[state=unchecked]:bg-white/75"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
