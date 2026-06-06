import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface FindingCardProps {
  id: string;
  file_path: string;
  line_number: number | null;
  summary: string;
  explanation: string;
  risk_level: "must_fix" | "should_fix_soon" | "ignore";
  suggested_fix: string | null;
  category: string | null;
  className?: string;
}

const severityConfig = {
  must_fix: {
    border: "border-l-4 border-l-destructive",
    bg: "bg-destructive/[0.03] dark:bg-destructive/[0.06]",
    badge: "critical" as const,
  },
  should_fix_soon: {
    border: "border-l-4 border-l-warning",
    bg: "bg-warning/[0.03] dark:bg-warning/[0.06]",
    badge: "moderate" as const,
  },
  ignore: {
    border: "border-l-4 border-l-border",
    bg: "",
    badge: "low" as const,
  },
};

export function FindingCard({
  risk_level,
  file_path,
  line_number,
  summary,
  explanation,
  suggested_fix,
  category,
  className,
}: FindingCardProps) {
  const config = severityConfig[risk_level];

  return (
    <Card
      className={cn(
        "border-border shadow-sm overflow-hidden",
        config.border,
        config.bg,
        className
      )}
    >
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5 min-w-0 flex-1">
            <p className="font-semibold text-foreground">{summary}</p>
            <p className="text-xs text-muted-foreground font-mono bg-secondary px-2 py-0.5 rounded inline-block max-w-full truncate">
              {file_path}
              {line_number ? `:${line_number}` : ""}
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0 mt-0.5 flex-wrap justify-end">
            <Badge
              variant={config.badge}
              className="capitalize text-xs"
            >
              {risk_level.replace(/_/g, " ")}
            </Badge>
            {category != null && (
              <Badge variant="outline" className="text-xs border-border">
                {category}
              </Badge>
            )}
          </div>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {explanation}
        </p>
        {suggested_fix != null && (
          <div className="rounded-lg bg-secondary p-3 border border-border">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                Suggested Fix
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <code className="text-xs font-mono block text-foreground leading-relaxed whitespace-pre-wrap">
              {suggested_fix}
            </code>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
