import { Badge, type BadgeProps } from "@/components/ui/badge"
import type { Finding } from "@/types"

export type SeverityLevel = Finding["risk_level"]

const severityConfig: Record<
  SeverityLevel,
  { label: string; variant: "critical" | "warning" | "low" }
> = {
  must_fix: { label: "Must fix", variant: "critical" },
  should_fix_soon: { label: "Should fix", variant: "warning" },
  ignore: { label: "Ignore", variant: "low" },
}

export interface SeverityBadgeProps extends Omit<BadgeProps, "variant"> {
  level: SeverityLevel
}

function SeverityBadge({ level, className, ...props }: SeverityBadgeProps) {
  const config = severityConfig[level] ?? severityConfig.ignore
  return (
    <Badge
      variant={config.variant}
      aria-label={`Severity: ${config.label}`}
      className={className}
      {...props}
    >
      {config.label}
    </Badge>
  )
}

export { SeverityBadge, severityConfig }
