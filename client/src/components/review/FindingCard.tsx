import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Check, Copy, ExternalLink, RotateCcw, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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
  disposition?: "open" | "resolved" | "false_positive" | "accepted_risk";
  onDisposition?: (disposition: "open" | "resolved" | "false_positive" | "accepted_risk") => void;
  sourceUrl?: string;
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
  disposition = "open",
  onDisposition,
  sourceUrl,
}: FindingCardProps) {
  const config = severityConfig[risk_level];
  const { toast } = useToast();

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
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <Button variant="ghost" size="sm" onClick={() => { navigator.clipboard.writeText(`${summary}\n${file_path}${line_number ? `:${line_number}` : ""}\n${explanation}${suggested_fix ? `\nFix: ${suggested_fix}` : ""}`); toast({ title: "Finding copied", variant: "success" }); }}>
            <Copy className="h-3.5 w-3.5" />Copy
          </Button>
          {sourceUrl && <Button asChild variant="ghost" size="sm"><a href={sourceUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" />Open source</a></Button>}
          {onDisposition && disposition === "open" && <>
            <Button variant="outline" size="sm" onClick={() => onDisposition("resolved")}><Check className="h-3.5 w-3.5" />Resolve</Button>
            <Button variant="outline" size="sm" onClick={() => onDisposition("false_positive")}><XCircle className="h-3.5 w-3.5" />False positive</Button>
            <Button variant="outline" size="sm" onClick={() => onDisposition("accepted_risk")}>Accept risk</Button>
          </>}
          {onDisposition && disposition !== "open" && <>
            <Badge variant="outline" className="capitalize">{disposition.replace(/_/g, " ")}</Badge>
            <Button variant="ghost" size="sm" onClick={() => onDisposition("open")}><RotateCcw className="h-3.5 w-3.5" />Reopen</Button>
          </>}
        </div>
      </CardContent>
    </Card>
  );
}
