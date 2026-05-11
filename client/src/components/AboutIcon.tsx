import { useEffect, useState, useRef } from "react";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";

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
  const [show, setShow] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((data) => setHealth({ version: data.version, deployedAt: data.deployedAt }))
      .catch(() => {});
  }, []);

  function handleEnter() {
    clearTimeout(timeoutRef.current);
    setShow(true);
  }

  function handleLeave() {
    timeoutRef.current = setTimeout(() => setShow(false), 200);
  }

  return (
    <div className="relative" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors" aria-label="About">
        <Info className="h-4 w-4" />
      </Button>

      {show && health && (
        <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 w-56 rounded-lg border border-border bg-card shadow-lg z-50 p-3 text-xs">
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-bold text-foreground tracking-tight">AutoReview</span>
            <span className="text-muted-foreground">v{health.version}</span>
          </div>
          <div className="text-muted-foreground">
            <span>Deployed: {formatDeployDate(health.deployedAt)}</span>
          </div>
          <div className="absolute left-0 top-1/2 -translate-x-full -translate-y-1/2">
            <div className="w-2 h-2 rotate-45 border-l border-b border-border bg-card" />
          </div>
        </div>
      )}
    </div>
  );
}
