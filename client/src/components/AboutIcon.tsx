import { useEffect, useState, useRef } from "react";
import { Info, X } from "lucide-react";
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
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((data) => setHealth({ version: data.version, deployedAt: data.deployedAt }))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!show) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setShow(false);
    }
    document.addEventListener("keydown", handleKey);
    closeRef.current?.focus();
    return () => document.removeEventListener("keydown", handleKey);
  }, [show]);

  return (
    <>
      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors" aria-label="About" onClick={() => setShow(true)}>
        <Info className="h-4 w-4" />
      </Button>

      {show && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50" onClick={() => setShow(false)}>
          <div className="bg-card border border-border rounded-xl shadow-2xl p-6 w-80" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <span className="font-semibold text-lg text-foreground tracking-tight">AutoReview</span>
              <Button ref={closeRef} variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => setShow(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            {health ? (
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Version</span>
                  <span className="font-mono text-foreground">{health.version}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Deployed</span>
                  <span className="text-foreground">{formatDeployDate(health.deployedAt)}</span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Loading...</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
