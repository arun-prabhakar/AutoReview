import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CopyButton, SeverityBadge } from "@/components/shared";
import { Check, Copy, ExternalLink, FileCode, FileDiff, RotateCcw, XCircle } from "lucide-react";
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
  onViewInDiff?: () => void;
}

const severityConfig = {
  must_fix: {
    border: "border-l-4 border-l-destructive",
    bg: "bg-destructive/[0.03] dark:bg-destructive/[0.06]",
  },
  should_fix_soon: {
    border: "border-l-4 border-l-warning",
    bg: "bg-warning/[0.03] dark:bg-warning/[0.06]",
  },
  ignore: {
    border: "border-l-4 border-l-border",
    bg: "",
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
  onViewInDiff,
}: FindingCardProps) {
  const config = severityConfig[risk_level];
  const { toast } = useToast();
  const location = `${file_path}${line_number ? `:${line_number}` : ""}`;

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
        <div className="flex items-start justify-between gap-x-4 gap-y-2 flex-wrap">
          <p
            className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded bg-secondary px-1.5 py-0.5 font-mono text-xs text-muted-foreground"
            title={location}
          >
            <FileCode className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="truncate">{location}</span>
          </p>
          <div className="flex shrink-0 flex-wrap gap-1.5 -mt-0.5">
            <SeverityBadge level={risk_level} className="text-xs" />
            {category != null && (
              <Badge variant="outline" className="text-xs border-border">
                {category}
              </Badge>
            )}
          </div>
        </div>
        <p className="font-semibold text-foreground break-words">{summary}</p>
        <p className="text-sm leading-relaxed text-muted-foreground break-words">
          {explanation}
        </p>
        {suggested_fix != null && (
          <div className="rounded-lg border border-border bg-secondary/60">
            <div className="flex items-center justify-between gap-2 border-b border-border/70 py-1 pl-3 pr-1.5">
              <span
                className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground"
                style={{ lineHeight: "1.5" }}
              >
                Suggested fix
              </span>
              <CopyButton
                value={suggested_fix}
                label="Copy suggested fix"
                toastLabel="Suggested fix"
                className="h-6 w-6 [&_svg]:size-3.5"
              />
            </div>
            <div className="p-3">
              <code className="block whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground">
                {suggested_fix}
              </code>
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <Button variant="ghost" size="sm" onClick={() => { navigator.clipboard.writeText(`${summary}\n${location}\n${explanation}${suggested_fix ? `\nFix: ${suggested_fix}` : ""}`); toast({ title: "Finding copied", variant: "success" }); }}>
            <Copy className="h-3.5 w-3.5" />Copy
          </Button>
          {onViewInDiff && (
            <Button variant="ghost" size="sm" onClick={onViewInDiff}>
              <FileDiff className="h-3.5 w-3.5" />View in diff
            </Button>
          )}
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
