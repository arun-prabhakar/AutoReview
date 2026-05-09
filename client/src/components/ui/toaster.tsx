import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"
import { CheckCircle2, AlertTriangle, AlertCircle } from "lucide-react"

const variantIcons: Record<string, React.ReactNode> = {
  default: null,
  destructive: <AlertCircle className="h-4 w-4 text-destructive shrink-0" />,
  success: <CheckCircle2 className="h-4 w-4 text-success shrink-0" />,
  warning: <AlertTriangle className="h-4 w-4 text-warning shrink-0" />,
}

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        const icon = variantIcons[props.variant || "default"]
        return (
          <Toast key={id} {...props}>
            <div className="flex items-start gap-3">
              {icon}
              <div className="grid gap-1">
                {title && <ToastTitle>{title}</ToastTitle>}
                {description && (
                  <ToastDescription>{description}</ToastDescription>
                )}
              </div>
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
