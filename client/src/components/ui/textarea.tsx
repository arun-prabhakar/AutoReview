import * as React from "react"

import { cn } from "@/lib/utils"

const textareaClasses =
  "flex min-h-[80px] w-full rounded-lg border border-input bg-transparent px-3 py-2 text-base transition-[border-color,box-shadow] duration-fast ease-out-expo placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm aria-invalid:border-destructive aria-invalid:focus-visible:ring-destructive/50 dark:bg-secondary"

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(textareaClasses, className)}
      ref={ref}
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
