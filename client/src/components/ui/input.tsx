import * as React from "react"

import { cn } from "@/lib/utils"

export interface InputProps extends React.ComponentProps<"input"> {
  error?: boolean
  icon?: React.ReactNode
}

const inputClasses =
  "flex h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-base transition-[border-color,box-shadow] duration-fast ease-out-expo placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm aria-invalid:border-destructive aria-invalid:focus-visible:ring-destructive/50 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground dark:bg-secondary"

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, icon, ...props }, ref) => {
    const field = (extra?: string) => (
      <input
        type={type}
        className={cn(inputClasses, extra, className)}
        ref={ref}
        aria-invalid={error}
        {...props}
      />
    )

    if (icon) {
      return (
        <div className="relative w-full">
          <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground [&>svg]:h-4 [&>svg]:w-4">
            {icon}
          </div>
          {field("pl-9")}
        </div>
      )
    }

    return field()
  }
)
Input.displayName = "Input"

export { Input }
