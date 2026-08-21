import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

export interface TableSkeletonProps {
  rows?: number
  columns?: number
  className?: string
}

function TableSkeleton({
  rows = 5,
  columns = 5,
  className,
}: TableSkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn("rounded-xl border bg-card", className)}
    >
      <div className="flex items-center gap-4 border-b px-4 py-3">
        {Array.from({ length: columns }, (_, column) => (
          <Skeleton
            key={column}
            className={cn(
              "h-3",
              column === 0 ? "flex-1" : "w-20",
              column > 2 && "hidden lg:block"
            )}
          />
        ))}
      </div>
      {Array.from({ length: rows }, (_, row) => (
        <div
          key={row}
          className={cn(
            "flex items-center gap-4 px-4 py-3.5",
            row !== rows - 1 && "border-b"
          )}
        >
          {Array.from({ length: columns }, (_, column) => (
            <Skeleton
              key={column}
              className={cn(
                "h-4",
                column === 0 ? "flex-1" : "w-20",
                column > 2 && "hidden lg:block"
              )}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

const cardsGridClasses = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 lg:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4",
} as const

export type CardsSkeletonCount = keyof typeof cardsGridClasses

export interface CardsSkeletonProps {
  count?: CardsSkeletonCount
  className?: string
}

function CardsSkeleton({ count = 4, className }: CardsSkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn("grid grid-cols-1 gap-4", cardsGridClasses[count], className)}
    >
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="space-y-3 rounded-xl border bg-card p-5">
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="h-7 w-1/2" />
          <Skeleton className="h-3 w-1/4" />
        </div>
      ))}
    </div>
  )
}

export interface DetailSkeletonProps {
  className?: string
}

function DetailSkeleton({ className }: DetailSkeletonProps) {
  return (
    <div aria-hidden="true" className={cn("space-y-6", className)}>
      <div className="space-y-2">
        <Skeleton className="h-7 w-1/3" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <Skeleton className="h-10 w-full rounded-lg" />
      <div className="space-y-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    </div>
  )
}

export { TableSkeleton, CardsSkeleton, DetailSkeleton }
