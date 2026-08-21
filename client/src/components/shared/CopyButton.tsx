import * as React from "react"
import { Check, Copy } from "lucide-react"

import { Button, type ButtonProps } from "@/components/ui/button"
import { toast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

const COPY_FEEDBACK_MS = 1500

export interface CopyButtonProps extends Omit<ButtonProps, "children"> {
  value: string
  label?: string
  toastLabel?: string
}

const CopyButton = React.forwardRef<HTMLButtonElement, CopyButtonProps>(
  ({ value, label = "Copy", toastLabel, className, onClick, ...props }, ref) => {
    const [copied, setCopied] = React.useState(false)
    const timeoutRef = React.useRef<number | undefined>(undefined)
    React.useEffect(() => () => window.clearTimeout(timeoutRef.current), [])

    const handleCopy = async (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      onClick?.(event)
      try {
        await navigator.clipboard.writeText(value)
        setCopied(true)
        window.clearTimeout(timeoutRef.current)
        timeoutRef.current = window.setTimeout(
          () => setCopied(false),
          COPY_FEEDBACK_MS
        )
        if (toastLabel) {
          toast({ title: "Copied to clipboard", description: toastLabel })
        }
      } catch {
        setCopied(false)
      }
    }

    return (
      <Button
        ref={ref}
        variant="ghost"
        size="icon-sm"
        aria-label={label}
        aria-live="polite"
        className={cn("text-muted-foreground hover:text-foreground", className)}
        onClick={handleCopy}
        {...props}
      >
        {copied ? <Check className="text-success" /> : <Copy />}
      </Button>
    )
  }
)
CopyButton.displayName = "CopyButton"

export { CopyButton }
