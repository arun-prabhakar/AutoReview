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
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors" aria-label="About">
            <Info className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right" align="end">
          <p className="font-semibold text-foreground mb-2">AutoReview</p>
          {health ? (
            <div className="space-y-1">
              <div className="flex justify-between gap-6">
                <span className="text-muted-foreground">Version</span>
                <span className="font-mono">{health.version}</span>
              </div>
              <div className="flex justify-between gap-6">
                <span className="text-muted-foreground">Deployed</span>
                <span>{formatDeployDate(health.deployedAt)}</span>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground">Loading…</p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
