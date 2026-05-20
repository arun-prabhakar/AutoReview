import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { type RootState, type AppDispatch } from "@/store";
import { fetchReviewDetail } from "@/store/reviewDetailSlice";
import { markReviewNotificationsRead } from "@/store/notificationsSlice";
import type { Finding, ReviewChainItem, ShareToken } from "@/types";
import { api } from "@/services/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Trash2, Mail, ChevronDown, ChevronUp, GitCommitHorizontal, GitBranch, Shield, FileSearch, Clock, RotateCcw, Coins, FileText, History, Share2, Link2, Copy, Check, AlertCircle, FileCode } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function ReviewDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();
  const { review, findings, loading } = useSelector((state: RootState) => state.reviewDetail);
  const user = useSelector((state: RootState) => state.auth.user);
  const { toast } = useToast();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [emailVisible, setEmailVisible] = useState(false);
  const [rereviewing, setRereviewing] = useState(false);
  const [rereviewOpen, setRereviewOpen] = useState(false);
  const [chain, setChain] = useState<ReviewChainItem[]>([]);
  const [chainVisible, setChainVisible] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareExpiry, setShareExpiry] = useState(0);
  const [shareData, setShareData] = useState<ShareToken | null>(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [diffVisible, setDiffVisible] = useState(false);

  useEffect(() => {
    if (id) dispatch(fetchReviewDetail(id));
  }, [id, dispatch]);

  useEffect(() => {
    if (id) dispatch(markReviewNotificationsRead(id));
  }, [id, dispatch]);

  useEffect(() => {
    if (id) {
      api.get<ReviewChainItem[]>(`/api/reviews/${id}/chain`).then(setChain).catch(() => {});
    }
  }, [id]);

  const handleRereview = async () => {
    if (!id) return;
    setRereviewing(true);
    try {
      const result = await api.post<{ reviewId: string }>(`/api/reviews/${id}/rereview`, {});
      toast({ title: "Re-review started", description: "A new review is being generated.", variant: "success" });
      navigate(`/reviews/${result.reviewId}`);
    } catch (err) {
      toast({ title: "Re-review failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setRereviewing(false);
      setRereviewOpen(false);
    }
  };

  const handleShare = async () => {
    if (!id) return;
    setShareLoading(true);
    try {
      const result = await api.post<ShareToken>("/api/share", { review_id: id, expires_in_days: shareExpiry });
      setShareData(result);
      setShareOpen(false);
    } catch (err) {
      toast({ title: "Failed to create share link", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setShareLoading(false);
    }
  };

  const handleToggleShare = async () => {
    if (!shareData) return;
    try {
      if (shareData.enabled) {
        await api.del(`/api/share/${shareData.token}`);
        setShareData({ ...shareData, enabled: false });
        toast({ title: "Share link disabled", variant: "success" });
      } else {
        await handleShare();
      }
    } catch (err) {
      toast({ title: "Failed to update share link", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    }
  };

  const handleCopyLink = async () => {
    if (!shareData?.url) return;
    const url = shareData.url.startsWith("http") ? shareData.url : `${window.location.origin}${shareData.url}`;
    await navigator.clipboard.writeText(url);
    setShareCopied(true);
    toast({ title: "Link copied to clipboard", variant: "success" });
    setTimeout(() => setShareCopied(false), 2000);
  };

  if (loading) return <div className="space-y-4"><Skeleton className="h-32 w-full" /><Skeleton className="h-64 w-full" /></div>;
  if (!review) return (
    <div className="flex flex-col items-center justify-center py-16 gap-4">
      <FileSearch className="h-12 w-12 text-muted-foreground/50" />
      <h3 className="text-lg font-semibold">Review not found</h3>
      <p className="text-sm text-muted-foreground">This review may have been deleted or doesn&apos;t exist.</p>
      <Button variant="outline" onClick={() => navigate("/")}>Go to Dashboard</Button>
    </div>
  );

  const grouped = {
    must_fix: findings.filter((f) => f.risk_level === "must_fix"),
    should_fix_soon: findings.filter((f) => f.risk_level === "should_fix_soon"),
    ignore: findings.filter((f) => f.risk_level === "ignore"),
  };

  const isPrReview = String(review.commit_hash).startsWith("pr:");
  const prId = isPrReview ? String(review.commit_hash).replace("pr:", "") : null;
  const repoName = String(review.repository_name || review.repository_id);
  const branch = String(review.branch || "N/A");
  const aiOverview = String(review.ai_overview || "Review completed.");

  const totalFindings = findings.length;
  const worstRisk = grouped.must_fix.length > 0 ? "critical" : grouped.should_fix_soon.length > 0 ? "warning" : "clean";

  const formatFinding = (f: Finding, index: number) => {
    const location = f.file_path + (f.line_number ? `:${f.line_number}` : "");
    const category = f.category ? ` [${f.category}]` : "";
    const fix = f.suggested_fix
      ? `\n     Suggested Fix:\n       ${f.suggested_fix.replace(/\n/g, "\n       ")}`
      : "";
    return `  ${index + 1}. ${f.summary}${category}\n     File: ${location}\n     ${f.explanation}${fix}`;
  };

  const sectionBlock = (label: string, items: Finding[]) => {
    if (items.length === 0) return "";
    return `${label} (${items.length}):\n\n${items.map(formatFinding).join("\n\n")}\n\n`;
  };

  const diffStats = (() => {
    const isPr = review.review_mode === "pr" || review.commit_hash?.startsWith("pr:");
    const commitLabel = isPr ? `Pull Request #${String(review.commit_hash).replace("pr:", "")}` : `Commit ${String(review.commit_hash).substring(0, 12)}`;
    return { commitLabel };
  })();

  const categoryBreakdown = findings.length > 0
    ? findings.reduce<Record<string, number>>((acc, f) => {
        const cat = f.category || "other";
        acc[cat] = (acc[cat] || 0) + 1;
        return acc;
      }, {})
    : null;

  const categoryLines = categoryBreakdown
    ? Object.entries(categoryBreakdown)
        .sort(([, a], [, b]) => b - a)
        .map(([cat, count]) => `     ${cat.padEnd(20)} ${count}`)
        .join("\n")
    : "     (none)";

  const FAILURE_LABELS: Record<string, string> = {
    llm_context_exceeded: "LLM Context Exceeded",
    llm_rate_limited: "LLM Rate Limited",
    llm_auth_failed: "LLM Auth Failed",
    llm_unavailable: "LLM Unavailable",
    vcs_rate_limited: "VCS Rate Limited",
    vcs_auth_failed: "VCS Auth Failed",
    vcs_not_found: "Commit / PR Not Found",
    no_provider: "No LLM Provider Configured",
    no_credential: "No Credential Configured",
    internal_error: "Internal Error",
  };

  const riskAssessment = grouped.must_fix.length > 0
    ? "⛔ HIGH RISK — Action required before merge"
    : grouped.should_fix_soon.length > 0
      ? "⚠️  MODERATE RISK — Review recommended"
      : findings.length > 0
        ? "✅ LOW RISK — Informational findings only"
        : "✅ CLEAN — No issues detected";

  const findingsBody = findings.length === 0
    ? "No issues found. The diff looks clean.\n"
    : `${sectionBlock("MUST FIX", grouped.must_fix)}${sectionBlock("SHOULD FIX SOON", grouped.should_fix_soon)}${sectionBlock("CAN IGNORE", grouped.ignore)}`;

  const emailBody = `Hi Team,

AutoReview has completed an automated code review for ${repoName}.

══════════════════════════════════════════════════
  RISK ASSESSMENT: ${riskAssessment}
══════════════════════════════════════════════════

┌──────────────────────────────────────────────┐
│  REVIEW DETAILS                               │
└──────────────────────────────────────────────┘

  Repository    : ${repoName}
  Target        : ${diffStats.commitLabel}
  Branch        : ${branch}
  Review Mode   : ${isPrReview ? "Pull Request" : "Manual Commit"}
  Strictness    : ${String(review.strictness)}
${review.tokens_total ? `  Tokens Used   : ${review.tokens_total.toLocaleString()}` : ""}
${review.estimated_cost ? `  Est. Cost     : $${review.estimated_cost.toFixed(4)}` : ""}

┌──────────────────────────────────────────────┐
│  AI OVERVIEW                                  │
└──────────────────────────────────────────────┘

${aiOverview}

┌──────────────────────────────────────────────┐
│  FINDINGS SUMMARY                             │
└──────────────────────────────────────────────┘

  🔴 Must Fix         : ${grouped.must_fix.length}
  🟡 Should Fix Soon  : ${grouped.should_fix_soon.length}
  ⚪ Informational     : ${grouped.ignore.length}
  ─────────────────────────────────
  Total               : ${totalFindings}

  By Category:
${categoryLines}

┌──────────────────────────────────────────────┐
│  DETAILED FINDINGS                             │
└──────────────────────────────────────────────┘

${findingsBody}══════════════════════════════════════════════════

This review was generated automatically by AutoReview.
Review findings are AI-generated and should be validated by a human reviewer.

Regards,
AutoReview`;

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.del(`/api/reviews/${id}`);
      toast({ title: "Review deleted", variant: "success" });
      navigate("/");
    } catch (err) {
      toast({ title: "Delete failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-bold tracking-tight">Review Detail</h2>
          <nav className="flex items-center gap-2 text-sm text-muted-foreground">
            <button onClick={() => navigate("/")} className="hover:text-foreground transition-colors">Dashboard</button>
            <span>/</span>
            <span className="text-foreground font-medium">Review</span>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={shareData ? undefined : () => setShareOpen(true)} disabled={shareLoading}>
            <Share2 className="h-3.5 w-3.5 mr-1.5" />
            {shareLoading ? "Sharing..." : "Share"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setRereviewOpen(true)} disabled={rereviewing}>
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            {rereviewing ? "Re-reviewing..." : "Re-review"}
          </Button>

      {user?.role === "admin" && (
            <Button variant="outline" size="sm" className="border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Delete
            </Button>
          )}
        </div>
       </div>

      {shareData && (
        <Card className="border-border bg-card">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-3">
              <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0", shareData.enabled ? "bg-success/10" : "bg-muted")}>
                <Link2 className={cn("h-4 w-4", shareData.enabled ? "text-success" : "text-muted-foreground")} />
              </div>
              <div className="flex-1 min-w-0 flex items-center gap-2">
                <code className="text-xs font-mono text-foreground truncate flex-1 block">
                  {shareData.url?.startsWith("http") ? shareData.url : `${window.location.origin}${shareData.url}`}
                </code>
                <Button variant="outline" size="sm" className="h-7 text-xs flex-shrink-0" onClick={handleCopyLink}>
                  {shareCopied ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                  {shareCopied ? "Copied" : "Copy"}
                </Button>
                <Button variant="outline" size="sm" className="h-7 text-xs flex-shrink-0" onClick={handleToggleShare}>
                  {shareData.enabled ? "Disable" : "Enable"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {review.diff_text && (
        <Card className="border-border">
          <button
            onClick={() => setDiffVisible(!diffVisible)}
            aria-expanded={diffVisible}
            aria-controls="diff-content"
            className="w-full flex items-center justify-between px-6 py-4 hover:bg-accent transition-colors rounded-t-lg"
          >
            <div className="flex items-center gap-2.5">
              <FileCode className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold text-foreground">Diff</span>
              {!diffVisible && <span className="text-xs text-muted-foreground">Click to view the reviewed changes</span>}
            </div>
            <div className="flex items-center gap-3">
              {diffVisible && (
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(review.diff_text!); toast({ title: "Diff copied to clipboard", variant: "success" }); }}>
                  Copy
                </Button>
              )}
              {diffVisible ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </div>
          </button>
          {diffVisible && (
            <CardContent id="diff-content" className="pt-0 pb-4 border-t border-border">
              <div className="overflow-x-auto mt-4 rounded-md border border-border bg-secondary/50">
                <div className="text-xs font-mono leading-relaxed whitespace-pre">
                  {review.diff_text.split("\n").map((line, i) => (
                    <div
                      key={i}
                      className={cn(
                        "flex",
                        line.startsWith("+") && !line.startsWith("++")
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : line.startsWith("-") && !line.startsWith("--")
                            ? "bg-red-500/10 text-red-600 dark:text-red-400"
                            : line.startsWith("@@")
                              ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                              : ""
                      )}
                    >
                      <span className="inline-block w-10 shrink-0 select-none text-right pr-3 text-muted-foreground/40 border-r border-border/50 mr-3">{i + 1}</span>
                      <span className="px-1 flex-1">{line}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {review.status === "failed" && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 flex items-start gap-3">
          <AlertCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-destructive">
              {FAILURE_LABELS[review.failure_category ?? ""] ?? "Review Failed"}
            </p>
            {review.error_message && (
              <p className="text-xs text-destructive/80 mt-0.5 font-mono break-all">{review.error_message}</p>
            )}
          </div>
        </div>
      )}

      {chain.length > 1 && (
        <Card className="border-border bg-card">
          <button
            onClick={() => setChainVisible(!chainVisible)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent transition-colors rounded-lg"
          >
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold text-foreground">Review History ({chain.length} reviews)</span>
            </div>
            {chainVisible ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>
          {chainVisible && (
            <CardContent className="pt-0 pb-4 border-t border-border">
              <div className="space-y-2 mt-3">
                {chain.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => item.id !== id && navigate(`/reviews/${item.id}`)}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2 rounded-lg text-left text-sm transition-colors",
                      item.id === id ? "bg-secondary" : "hover:bg-accent cursor-pointer"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <Badge variant={item.status === "completed" ? "default" : "destructive"} className="text-xs capitalize">{item.status}</Badge>
                      <span className="text-muted-foreground">{new Date(item.created_at).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Kolkata" })} {new Date(item.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" })}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      {Number(item.must_fix_count) > 0 && <span className="text-destructive font-medium">{item.must_fix_count} must-fix</span>}
                      <span className="text-muted-foreground">{item.total_findings} findings</span>
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          )}
        </Card>
      )}

      <Card className="border-border bg-card">
        <CardContent className="pt-6 pb-5">
            <div className="flex items-start justify-between gap-6 mb-4">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "h-10 w-10 rounded-lg flex items-center justify-center",
                  worstRisk === "critical" ? "bg-destructive/10" : worstRisk === "warning" ? "bg-warning/10" : "bg-success/10"
                )}>
                  <Shield className={cn(
                    "h-5 w-5",
                    worstRisk === "critical" ? "text-destructive" : worstRisk === "warning" ? "text-warning" : "text-success"
                  )} />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">{repoName}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {isPrReview ? `Pull Request #${prId}` : "Commit Review"}
                    {review.commit_author && ` · by ${review.commit_author}`}
                    {review.completed_at && ` · ${new Date(String(review.completed_at)).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Kolkata" })}`}
                  </p>
                </div>
              </div>
              <Badge variant={review.status === "completed" ? "default" : "destructive"} className="capitalize">{String(review.status)}</Badge>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2">
                <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Branch</p>
                  <p className="text-sm font-medium text-foreground">{branch}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2">
                <GitCommitHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Commit</p>
                  <p className="text-sm font-mono text-foreground">{isPrReview ? `PR #${prId}` : String(review.commit_hash).substring(0, 8)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2">
                <FileSearch className="h-3.5 w-3.5 text-muted-foreground" />
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Mode</p>
                  <p className="text-sm font-medium capitalize text-foreground">{String(review.review_mode)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Strictness</p>
                  <p className="text-sm font-medium capitalize text-foreground">{String(review.strictness)}</p>
                </div>
              </div>
            </div>

            {aiOverview && aiOverview !== "Review completed." && (
              <div className="mt-4 rounded-lg border border-border p-4 space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">AI Overview</p>
                {aiOverview.split(/\n\n+/).map((block, i) => {
                  const lines = block.trim().split("\n");
                  const isLabel = lines[0] === lines[0].toUpperCase() && lines[0].length < 40;
                  return isLabel && lines.length > 1 ? (
                    <div key={i}>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">{lines[0]}</p>
                      <p className="text-sm leading-relaxed text-foreground">{lines.slice(1).join(" ")}</p>
                    </div>
                  ) : (
                    <p key={i} className="text-sm leading-relaxed text-foreground">{block.trim()}</p>
                  );
                })}
              </div>
            )}

            {(review.tokens_total != null || review.project_context) && (
              <div className="mt-3 flex flex-wrap gap-2">
                {review.tokens_total != null && (
                  <div className="flex items-center gap-1.5 rounded-md bg-secondary px-2.5 py-1 text-xs">
                    <Coins className="h-3 w-3 text-muted-foreground" />
                    <span className="text-muted-foreground">{review.tokens_total.toLocaleString()} tokens</span>
                    {review.estimated_cost != null && review.estimated_cost > 0 && (
                      <span className="text-muted-foreground">· ${review.estimated_cost.toFixed(4)}</span>
                    )}
                  </div>
                )}
                {review.project_context && (
                  <div className="flex items-center gap-1.5 rounded-md bg-secondary px-2.5 py-1 text-xs">
                    <FileText className="h-3 w-3 text-muted-foreground" />
                    <span className="text-muted-foreground">.autoreview.md loaded</span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl border border-border bg-card text-center">
          <p className="text-xs font-bold uppercase tracking-wider text-destructive">Must Fix</p>
          <span className="text-2xl font-bold tabular-nums text-destructive">{grouped.must_fix.length}</span>
        </div>
        <div className="p-4 rounded-xl border border-border bg-card text-center">
          <p className="text-xs font-bold uppercase tracking-wider text-warning">Should Fix</p>
          <span className="text-2xl font-bold tabular-nums text-warning">{grouped.should_fix_soon.length}</span>
        </div>
        <div className="p-4 rounded-xl border border-border bg-card text-center">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Ignored</p>
          <span className="text-2xl font-bold tabular-nums text-foreground">{grouped.ignore.length}</span>
        </div>
        <div className="p-4 rounded-xl border border-border bg-card text-center">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Total</p>
          <span className="text-2xl font-bold tabular-nums text-foreground">{totalFindings}</span>
        </div>
      </div>

      {(["must_fix", "should_fix_soon", "ignore"] as const).map((level) => {
        const items = grouped[level];
        if (items.length === 0) return null;
        return (
          <div key={level} className="space-y-3">
              <div className="flex items-center gap-3 pt-2">
                <div className={cn(
                  "h-3 w-3 rounded-full",
                  level === "must_fix" ? "bg-destructive" : level === "should_fix_soon" ? "bg-warning" : "bg-muted-foreground"
                )} />
                <h3 className="text-lg font-bold tracking-tight capitalize text-foreground">{level.replace("_", " ")}</h3>
                <span className="text-xs text-muted-foreground">{items.length} {items.length === 1 ? "finding" : "findings"}</span>
              </div>
            {items.map((finding) => (
              <Card key={finding.id} className={cn(
                    "border-border shadow-sm overflow-hidden",
                    level === "must_fix" ? "border-l-4 border-l-destructive" : level === "should_fix_soon" ? "border-l-4 border-l-warning" : "border-l-4 border-l-border"
                  )}>
                  <CardContent className="pt-4 space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1.5">
                        <p className="font-semibold text-foreground">{finding.summary}</p>
                        <p className="text-xs text-muted-foreground font-mono bg-secondary px-2 py-0.5 rounded inline-block">
                          {finding.file_path}{finding.line_number ? `:${finding.line_number}` : ""}
                        </p>
                      </div>
                      <div className="flex gap-2 flex-shrink-0 mt-0.5 flex-wrap justify-end">
                        <Badge variant={level === "must_fix" ? "critical" : level === "should_fix_soon" ? "moderate" : "low"} className="capitalize text-xs">{level.replace("_", " ")}</Badge>
                        {finding.category != null && <Badge variant="outline" className="text-xs border-border">{finding.category}</Badge>}
                      </div>
                    </div>
                    <p className="text-sm leading-relaxed text-muted-foreground">{finding.explanation}</p>
                    {finding.suggested_fix != null && (
                      <div className="rounded-lg bg-secondary p-3 border border-border">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-bold uppercase tracking-wider text-foreground">Suggested Fix</span>
                          <div className="h-px flex-1 bg-border" />
                        </div>
                        <code className="text-xs font-mono block text-foreground leading-relaxed whitespace-pre-wrap">{finding.suggested_fix}</code>
                      </div>
                    )}
                  </CardContent>
                </Card>
            ))}
          </div>
        );
      })}

      {user?.role === "admin" && (
        <Card className="border-border">
          <button
            onClick={() => setEmailVisible(!emailVisible)}
            aria-expanded={emailVisible}
            aria-controls="email-draft-content"
            className="w-full flex items-center justify-between px-6 py-4 hover:bg-accent transition-colors rounded-t-lg"
          >
            <div className="flex items-center gap-2.5">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold text-foreground">Email Draft</span>
              {!emailVisible && <span className="text-xs text-muted-foreground">Click to preview</span>}
            </div>
            <div className="flex items-center gap-3">
              {emailVisible && (
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(emailBody); toast({ title: "Copied to clipboard", variant: "success" }); }}>
                  Copy
                </Button>
              )}
              {emailVisible ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </div>
          </button>
          {emailVisible && (
            <CardContent id="email-draft-content" className="pt-0 pb-4 border-t border-border">
              <pre className="whitespace-pre-wrap rounded-md bg-secondary p-4 text-xs font-mono leading-relaxed mt-4">{emailBody}</pre>
            </CardContent>
          )}
        </Card>
      )}

      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="h-4 w-4" />
              Share Review
            </DialogTitle>
            <DialogDescription className="pt-1">
              Create a public link to share this review. Anyone with the link can view it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Link expires after</label>
              <div className="flex flex-wrap gap-2 mt-2">
                {[
                  { label: "Permanent", value: 0 },
                  { label: "1 day", value: 1 },
                  { label: "7 days", value: 7 },
                  { label: "14 days", value: 14 },
                  { label: "30 days", value: 30 },
                  { label: "90 days", value: 90 },
                ].map((opt) => (
                  <Button
                    key={opt.value}
                    variant={shareExpiry === opt.value ? "default" : "outline"}
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setShareExpiry(opt.value)}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShareOpen(false)}>Cancel</Button>
            <Button onClick={handleShare} disabled={shareLoading}>
              {shareLoading ? "Creating..." : "Create Link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-4 w-4" />
              Delete Review
            </DialogTitle>
            <DialogDescription className="pt-1">
              This will permanently delete the review and all its findings. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete Review"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rereviewOpen} onOpenChange={setRereviewOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-4 w-4" />
              Re-review
            </DialogTitle>
            <DialogDescription className="pt-1">
              Trigger a new review for the same commit/PR. The previous review will be preserved in the history chain.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setRereviewOpen(false)}>Cancel</Button>
            <Button onClick={handleRereview} disabled={rereviewing}>
              {rereviewing ? "Starting..." : "Start Re-review"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
