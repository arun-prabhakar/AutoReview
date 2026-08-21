import * as React from "react"

import { cn } from "@/lib/utils"

const Kbd = React.forwardRef<HTMLElement, React.ComponentProps<"kbd">>(
  ({ className, ...props }, ref) => (
    <kbd
      ref={ref}
      className={cn(
        "inline-flex h-5 min-w-5 select-none items-center justify-center rounded-md border bg-muted px-1.5 font-mono text-xs font-medium text-muted-foreground shadow-[0_1px_0_hsl(var(--border))]",
        className
      )}
      {...props}
    />
  )
)
Kbd.displayName = "Kbd"

export { Kbd }
