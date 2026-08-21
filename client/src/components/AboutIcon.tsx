import { useEffect, useState } from "react";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface HealthInfo {
  version: string;
  deployedAt: string;
}

function formatDeployDate(iso: string): string {
  if (!iso) return "Unknown";
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function AboutIcon() {
  const [health, setHealth] = useState<HealthInfo | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((data) => setHealth({ version: data.version, deployedAt: data.deployedAt }))
      .catch(() => {});
  }, []);

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-foreground"
            aria-label="About AutoReview"
          >
            <Info className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right" align="end" collisionPadding={12} className="rounded-xl border border-border bg-popover px-3 py-2.5 shadow-card">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">AutoReview</p>
          {health ? (
            <div className="space-y-1.5">
              <div className="flex justify-between gap-6">
                <span className="text-xs text-muted-foreground">Version</span>
                <span className="font-mono text-xs text-foreground">{health.version}</span>
              </div>
              <div className="flex justify-between gap-6">
                <span className="text-xs text-muted-foreground">Deployed</span>
                <span className="text-xs text-foreground">{formatDeployDate(health.deployedAt)}</span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Loading...</p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
