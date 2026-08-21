import * as React from "react"

import { cn } from "@/lib/utils"

export interface PageHeaderProps
  extends React.HTMLAttributes<HTMLDivElement> {
  title: string
  description?: React.ReactNode
  actions?: React.ReactNode
  breadcrumb?: React.ReactNode
}

const PageHeader = React.forwardRef<HTMLDivElement, PageHeaderProps>(
  (
    { title, description, actions, breadcrumb, className, ...props },
    ref
  ) => (
    <div
      ref={ref}
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between",
        className
      )}
      {...props}
    >
      <div className="min-w-0 space-y-1.5">
        {breadcrumb && (
          <div className="text-xs text-muted-foreground">{breadcrumb}</div>
        )}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="max-w-2xl text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      )}
    </div>
  )
)
PageHeader.displayName = "PageHeader"

export { PageHeader }
