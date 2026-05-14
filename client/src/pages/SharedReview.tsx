import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  Shield,
  GitCommitHorizontal,
  GitBranch,
  FileSearch,
  Clock,
  Download,
  AlertCircle,
} from "lucide-react";

interface SharedFinding {
  id: string;
  file_path: string;
  line_number: number | null;
  summary: string;
  explanation: string;
  risk_level: "must_fix" | "should_fix_soon" | "ignore";
  suggested_fix: string | null;
  category: string | null;
}

interface SharedReviewData {
  id: string;
  commit_hash: string;
  branch: string | null;
  status: string;
  strictness: string;
  review_mode: string;
  created_at: string;
  completed_at: string | null;
  repository_name: string;
  ai_overview: string | null;
  findings: SharedFinding[];
  shared_at: string;
  expires_at: string;
}

const PRINT_STYLES = `
@media print {
  #shared-header { display: none !important; }
  .no-print { display: none !important; }
  body { background: white !important; color: black !important; }
  main { max-width: 100% !important; padding: 0 !important; }
  .print-card {
    border: 1px solid #ddd !important;
    break-inside: avoid;
    background: white !important;
  }
  .print-badge-destructive {
    background: #fee2e2 !important;
    color: #991b1b !important;
    border-color: #fecaca !important;
  }
  .print-badge-warning {
    background: #fef9c3 !important;
    color: #854d0e !important;
    border-color: #fef08a !important;
  }
  .print-badge-muted {
    background: #f3f4f6 !important;
    color: #374151 !important;
    border-color: #e5e7eb !important;
  }
}
`;

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function SharedReview() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<SharedReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!token) {
      setError(true);
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/share/${token}`);
        if (!res.ok) throw new Error("Not found");
        const json: SharedReviewData = await res.json();
        if (!cancelled) {
          setData(json);
          document.title = `AutoReview — ${json.repository_name}`;
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loading) {
    return (
      <>
        <style>{PRINT_STYLES}</style>
        <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30">
          <header className="sticky top-0 z-50 border-b bg-card/80 backdrop-blur-sm">
            <div className="mx-auto max-w-5xl flex items-center justify-between px-6 py-3">
              <div className="flex items-center gap-2">
                <Skeleton className="h-7 w-7 rounded" />
                <Skeleton className="h-5 w-24" />
              </div>
              <Skeleton className="h-9 w-32 rounded-md" />
            </div>
          </header>
          <main className="mx-auto max-w-5xl px-6 py-8 space-y-6">
            <Skeleton className="h-40 w-full rounded-lg" />
            <Skeleton className="h-24 w-full rounded-lg" />
            <Skeleton className="h-64 w-full rounded-lg" />
            <Skeleton className="h-48 w-full rounded-lg" />
          </main>
        </div>
      </>
    );
  }

  if (error || !data) {
    return (
      <>
        <style>{PRINT_STYLES}</style>
        <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30 flex flex-col">
          <header className="sticky top-0 z-50 border-b bg-card/80 backdrop-blur-sm">
            <div className="mx-auto max-w-5xl flex items-center gap-2 px-6 py-3">
              <img src="/favicon.svg" alt="" className="h-7 w-7" />
              <span className="font-bold tracking-tight">
                Auto<span className="text-foreground">Review</span>
              </span>
            </div>
          </header>
          <main className="flex-1 flex items-center justify-center px-6">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center">
                <AlertCircle className="h-8 w-8 text-muted-foreground/60" />
              </div>
              <h2 className="text-xl font-semibold text-foreground">
                This shared review is no longer available
              </h2>
              <p className="text-sm text-muted-foreground max-w-sm">
                The link may have expired, been revoked, or the review may have
                been removed.
              </p>
            </div>
          </main>
        </div>
      </>
    );
  }

  const findings = data.findings;
  const grouped = {
    must_fix: findings.filter((f) => f.risk_level === "must_fix"),
    should_fix_soon: findings.filter((f) => f.risk_level === "should_fix_soon"),
    ignore: findings.filter((f) => f.risk_level === "ignore"),
  };

  const isPrReview = String(data.commit_hash).startsWith("pr:");
  const prId = isPrReview
    ? String(data.commit_hash).replace("pr:", "")
    : null;
  const repoName = String(data.repository_name);
  const branch = String(data.branch || "N/A");
  const aiOverview = data.ai_overview;

  const totalFindings = findings.length;
  const worstRisk =
    grouped.must_fix.length > 0
      ? "critical"
      : grouped.should_fix_soon.length > 0
        ? "warning"
        : "clean";

  return (
    <>
      <style>{PRINT_STYLES}</style>
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30">
        <header
          id="shared-header"
          className="sticky top-0 z-50 border-b bg-card/80 backdrop-blur-sm"
        >
          <div className="mx-auto max-w-5xl flex items-center justify-between px-6 py-3">
            <div className="flex items-center gap-2">
              <img src="/favicon.svg" alt="" className="h-7 w-7" />
              <span className="font-bold tracking-tight text-lg">
                Auto<span className="text-foreground">Review</span>
              </span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs text-muted-foreground hidden sm:inline">
                Powered by AutoReview
              </span>
              <Button
                variant="outline"
                size="sm"
                className="no-print"
                onClick={() => window.print()}
              >
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Download PDF
              </Button>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-5xl px-6 py-8 space-y-6">
          <Card className="border-border bg-card print-card">
            <CardContent className="pt-6 pb-5">
              <div className="flex items-start justify-between gap-6 mb-4">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "h-10 w-10 rounded-lg flex items-center justify-center",
                      worstRisk === "critical"
                        ? "bg-destructive/10"
                        : worstRisk === "warning"
                          ? "bg-warning/10"
                          : "bg-success/10"
                    )}
                  >
                    <Shield
                      className={cn(
                        "h-5 w-5",
                        worstRisk === "critical"
                          ? "text-destructive"
                          : worstRisk === "warning"
                            ? "text-warning"
                            : "text-success"
                      )}
                    />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">
                      {repoName}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {isPrReview
                        ? `Pull Request #${prId}`
                        : "Commit Review"}
                      {data.completed_at &&
                        ` · ${new Date(String(data.completed_at)).toLocaleDateString()}`}
                    </p>
                  </div>
                </div>
                <Badge
                  variant={
                    data.status === "completed" ? "default" : "destructive"
                  }
                  className="capitalize"
                >
                  {String(data.status)}
                </Badge>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2">
                  <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Branch
                    </p>
                    <p className="text-sm font-medium text-foreground">
                      {branch}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2">
                  <GitCommitHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Commit
                    </p>
                    <p className="text-sm font-mono text-foreground">
                      {isPrReview
                        ? `PR #${prId}`
                        : String(data.commit_hash).substring(0, 8)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2">
                  <FileSearch className="h-3.5 w-3.5 text-muted-foreground" />
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Mode
                    </p>
                    <p className="text-sm font-medium capitalize text-foreground">
                      {String(data.review_mode)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Strictness
                    </p>
                    <p className="text-sm font-medium capitalize text-foreground">
                      {String(data.strictness)}
                    </p>
                  </div>
                </div>
              </div>

              {aiOverview && (
                <div className="mt-4 rounded-lg border border-border p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                    AI Overview
                  </p>
                  <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                    {aiOverview}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-4 rounded-xl border border-border bg-card text-center print-card print-badge-destructive">
              <p className="text-xs font-bold uppercase tracking-wider text-destructive">
                Must Fix
              </p>
              <span className="text-2xl font-bold tabular-nums text-destructive">
                {grouped.must_fix.length}
              </span>
            </div>
            <div className="p-4 rounded-xl border border-border bg-card text-center print-card print-badge-warning">
              <p className="text-xs font-bold uppercase tracking-wider text-warning">
                Should Fix
              </p>
              <span className="text-2xl font-bold tabular-nums text-warning">
                {grouped.should_fix_soon.length}
              </span>
            </div>
            <div className="p-4 rounded-xl border border-border bg-card text-center print-card print-badge-muted">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Ignored
              </p>
              <span className="text-2xl font-bold tabular-nums text-foreground">
                {grouped.ignore.length}
              </span>
            </div>
            <div className="p-4 rounded-xl border border-border bg-card text-center print-card">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Total
              </p>
              <span className="text-2xl font-bold tabular-nums text-foreground">
                {totalFindings}
              </span>
            </div>
          </div>

          {(["must_fix", "should_fix_soon", "ignore"] as const).map(
            (level) => {
              const items = grouped[level];
              if (items.length === 0) return null;
              return (
                <div key={level} className="space-y-3">
                  <div className="flex items-center gap-3 pt-2">
                    <div
                      className={cn(
                        "h-3 w-3 rounded-full",
                        level === "must_fix"
                          ? "bg-destructive"
                          : level === "should_fix_soon"
                            ? "bg-warning"
                            : "bg-muted-foreground"
                      )}
                    />
                    <h3 className="text-lg font-bold tracking-tight capitalize text-foreground">
                      {level.replace("_", " ")}
                    </h3>
                    <span className="text-xs text-muted-foreground">
                      {items.length}{" "}
                      {items.length === 1 ? "finding" : "findings"}
                    </span>
                  </div>
                  {items.map((finding) => (
                    <Card
                      key={finding.id}
                      className={cn(
                        "border-border shadow-sm overflow-hidden print-card",
                        level === "must_fix"
                          ? "border-l-4 border-l-destructive"
                          : level === "should_fix_soon"
                            ? "border-l-4 border-l-warning"
                            : "border-l-4 border-l-border"
                      )}
                    >
                      <CardContent className="pt-4 space-y-3">
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-1.5 min-w-0 flex-1">
                            <p className="font-semibold text-foreground">
                              {finding.summary}
                            </p>
                            <p className="text-xs text-muted-foreground font-mono bg-secondary px-2 py-0.5 rounded inline-block max-w-full truncate">
                              {finding.file_path}
                              {finding.line_number
                                ? `:${finding.line_number}`
                                : ""}
                            </p>
                          </div>
                          <div className="flex gap-2 mt-0.5 flex-wrap justify-end shrink-0 max-w-[50%]">
                            <Badge
                              variant={
                                level === "must_fix"
                                  ? "critical"
                                  : level === "should_fix_soon"
                                    ? "moderate"
                                    : "low"
                              }
                              className="capitalize text-xs"
                            >
                              {level.replace("_", " ")}
                            </Badge>
                            {finding.category != null && (
                              <Badge
                                variant="outline"
                                className="text-xs border-border"
                              >
                                {finding.category}
                              </Badge>
                            )}
                           </div>
                        </div>
                        <p className="text-sm leading-relaxed text-muted-foreground">
                          {finding.explanation}
                        </p>
                        {finding.suggested_fix != null && (
                          <div className="rounded-lg bg-secondary p-3 border border-border">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                                Suggested Fix
                              </span>
                              <div className="h-px flex-1 bg-border" />
                            </div>
                            <code className="text-xs font-mono block text-foreground leading-relaxed whitespace-pre-wrap">
                              {finding.suggested_fix}
                            </code>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              );
            }
          )}

          <footer className="pt-6 pb-8 border-t border-border text-center space-y-1">
            <p className="text-xs text-muted-foreground">
              Shared on {formatDate(data.shared_at)} · Link expires on{" "}
              {formatDate(data.expires_at)}
            </p>
            <p className="text-xs text-muted-foreground/70">
              Review generated by AutoReview AI. Findings are AI-generated and
              should be validated by a human reviewer.
            </p>
          </footer>
        </main>
      </div>
    </>
  );
}
