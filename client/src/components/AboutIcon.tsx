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
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((data) => setHealth({ version: data.version, deployedAt: data.deployedAt }))
      .catch(() => {});
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShow(false);
      }
    }
    if (show) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [show]);

  return (
    <div className="relative" ref={containerRef}>
      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors" aria-label="About" onClick={() => setShow(!show)}>
        <Info className="h-4 w-4" />
      </Button>

      {show && health && (
        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-60 rounded-lg border border-border bg-card shadow-lg z-[60] p-4 text-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="font-bold text-sm text-foreground tracking-tight">AutoReview</span>
            <span className="text-muted-foreground font-mono">v{health.version}</span>
          </div>
          <div className="text-muted-foreground">
            Deployed: {formatDeployDate(health.deployedAt)}
          </div>
          <div className="absolute left-1/2 top-full -translate-x-1/2">
            <div className="w-2 h-2 rotate-45 border-l border-b border-border bg-card" />
          </div>
        </div>
      )}
    </div>
  );
}
