import {
  Ban,
  CheckCircle2,
  Loader2,
  XCircle,
  type LucideIcon,
} from "lucide-react"

import { Badge, type BadgeProps } from "@/components/ui/badge"
import type { Review } from "@/types"

export type ReviewStatus = Review["status"]

const statusConfig: Record<
  ReviewStatus,
  { label: string; variant: BadgeProps["variant"]; icon: LucideIcon; spin?: boolean }
> = {
  pending: { label: "Pending", variant: "secondary", icon: Loader2, spin: true },
  completed: { label: "Completed", variant: "success", icon: CheckCircle2 },
  failed: { label: "Failed", variant: "critical", icon: XCircle },
  cancelled: { label: "Cancelled", variant: "outline", icon: Ban },
}

export interface StatusBadgeProps extends Omit<BadgeProps, "variant"> {
  status: ReviewStatus
}

function StatusBadge({ status, className, ...props }: StatusBadgeProps) {
  const config = statusConfig[status] ?? statusConfig.pending
  const Icon = config.icon

  return (
    <Badge
      variant={config.variant}
      aria-label={`Status: ${config.label}`}
      className={className}
      {...props}
    >
      <Icon className={config.spin ? "animate-spin" : undefined} />
      {config.label}
    </Badge>
  )
}

export { StatusBadge, statusConfig }
