import * as React from "react"

import { cn } from "@/lib/utils"

export type StatCardTone = "default" | "positive" | "warning" | "critical"

const toneClasses: Record<StatCardTone, { value: string; icon: string }> = {
  default: { value: "text-foreground", icon: "text-muted-foreground" },
  positive: { value: "text-success", icon: "text-success" },
  warning: { value: "text-warning", icon: "text-warning" },
  critical: { value: "text-destructive", icon: "text-destructive" },
}

export interface StatCardProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "onClick"> {
  label: string
  value: React.ReactNode
  icon?: React.ReactNode
  trend?: React.ReactNode
  onClick?: () => void
  tone?: StatCardTone
}

const StatCard = React.forwardRef<HTMLDivElement, StatCardProps>(
  (
    { label, value, icon, trend, onClick, tone = "default", className, ...props },
    ref
  ) => {
    const interactive = typeof onClick === "function"
    const toneClass = toneClasses[tone]

    return (
      <div
        ref={ref}
        role={interactive ? "button" : undefined}
        tabIndex={interactive ? 0 : undefined}
        onClick={onClick}
        onKeyDown={
          interactive
            ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault()
                  onClick?.()
                }
              }
            : undefined
        }
        className={cn(
          "rounded-xl border bg-card p-5 text-card-foreground shadow-card transition-[border-color,box-shadow] duration-fast ease-out-expo",
          interactive &&
            "cursor-pointer hover:border-muted-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          {icon && (
            <span className={cn("shrink-0 [&_svg]:h-4 [&_svg]:w-4", toneClass.icon)}>
              {icon}
            </span>
          )}
        </div>
        <p
          className={cn(
            "mt-2 text-2xl font-semibold tracking-tight tabular-nums",
            toneClass.value
          )}
        >
          {value}
        </p>
        {trend && (
          <div className="mt-1 text-xs text-muted-foreground">{trend}</div>
        )}
      </div>
    )
  }
)
StatCard.displayName = "StatCard"

export { StatCard }
