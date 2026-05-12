import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { type RootState, type AppDispatch } from "@/store";
import { fetchReviewDetail } from "@/store/reviewDetailSlice";
import type { Finding, FindingComment, ReviewChainItem } from "@/types";
import { api } from "@/services/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Trash2, Mail, ChevronDown, ChevronUp, GitCommitHorizontal, GitBranch, Shield, FileSearch, Clock, MessageSquare, RotateCcw, CheckCircle2, XCircle, Eye, Coins, FileText, History, Send } from "lucide-react";
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
  const [dispositionDialog, setDispositionDialog] = useState<{ findingId: string; disposition: string } | null>(null);
  const [dispositionReason, setDispositionReason] = useState("");
  const [dispositionLoading, setDispositionLoading] = useState(false);
  const [commentsMap, setCommentsMap] = useState<Record<string, FindingComment[]>>({});
  const [commentText, setCommentText] = useState<Record<string, string>>({});
  const [commentSubmitting, setCommentSubmitting] = useState<Record<string, boolean>>({});
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (id) dispatch(fetchReviewDetail(id));
  }, [id, dispatch]);

  useEffect(() => {
    if (id) {
      api.get<ReviewChainItem[]>(`/api/reviews/${id}/chain`).then(setChain).catch(() => {});
    }
  }, [id]);

  const loadComments = useCallback(async (findingId: string) => {
    try {
      const comments = await api.get<FindingComment[]>(`/api/findings/${findingId}/comments`);
      setCommentsMap((prev) => ({ ...prev, [findingId]: comments }));
    } catch { /* ignore */ }
  }, []);

  const toggleComments = useCallback((findingId: string) => {
    setExpandedComments((prev) => {
      const next = new Set(prev);
      if (next.has(findingId)) {
        next.delete(findingId);
      } else {
        next.add(findingId);
        loadComments(findingId);
      }
      return next;
    });
  }, [loadComments]);

  const submitComment = useCallback(async (findingId: string) => {
    const text = commentText[findingId]?.trim();
    if (!text) return;
    setCommentSubmitting((prev) => ({ ...prev, [findingId]: true }));
    try {
      const comment = await api.post<FindingComment>(`/api/findings/${findingId}/comments`, { content: text });
      setCommentsMap((prev) => ({ ...prev, [findingId]: [...(prev[findingId] || []), comment] }));
      setCommentText((prev) => ({ ...prev, [findingId]: "" }));
      toast({ title: "Comment added", variant: "success" });
    } catch (err) {
      toast({ title: "Failed to add comment", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setCommentSubmitting((prev) => ({ ...prev, [findingId]: false }));
    }
  }, [commentText, toast]);

  const handleDisposition = async () => {
    if (!dispositionDialog) return;
    setDispositionLoading(true);
    try {
      const updated = await api.patch<Finding>(`/api/findings/${dispositionDialog.findingId}/disposition`, {
        disposition: dispositionDialog.disposition,
        reason: dispositionReason || null,
      });
      if (updated) {
        dispatch(fetchReviewDetail(id!));
        toast({ title: `Finding marked as ${dispositionDialog.disposition}`, variant: "success" });
      }
    } catch (err) {
      toast({ title: "Failed to update disposition", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setDispositionLoading(false);
      setDispositionDialog(null);
      setDispositionReason("");
    }
  };

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

  const dispositionIcon = (d: string) => {
    switch (d) {
      case "acknowledged": return <Eye className="h-3 w-3" />;
      case "dismissed": return <XCircle className="h-3 w-3" />;
      case "fixed": return <CheckCircle2 className="h-3 w-3" />;
      default: return null;
    }
  };

  const dispositionColor = (d: string) => {
    switch (d) {
      case "acknowledged": return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      case "dismissed": return "bg-muted text-muted-foreground border-border";
      case "fixed": return "bg-success/10 text-success border-success/20";
      default: return "";
    }
  };

  const totalFindings = findings.length;
  const worstRisk = grouped.must_fix.length > 0 ? "critical" : grouped.should_fix_soon.length > 0 ? "warning" : "clean";
  const openFindings = findings.filter((f) => f.disposition === "open").length;

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
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold tracking-tight">Review Detail</h2>
          <nav className="flex items-center gap-2 text-sm text-muted-foreground">
            <button onClick={() => navigate("/")} className="hover:text-foreground transition-colors">Dashboard</button>
            <span>/</span>
            <span className="text-foreground font-medium">Review</span>
          </nav>
        </div>
        <div className="flex items-center gap-2">
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
                      <span className="text-muted-foreground">{new Date(item.created_at).toLocaleDateString()} {new Date(item.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
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
                    {review.completed_at && ` · ${new Date(String(review.completed_at)).toLocaleDateString()}`}
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
              <div className="mt-4 rounded-lg border border-border p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">AI Overview</p>
                <p className="text-sm leading-relaxed text-foreground">{aiOverview}</p>
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

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
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
        <div className="p-4 rounded-xl border border-border bg-card text-center">
          <p className="text-xs font-bold uppercase tracking-wider text-blue-500">Open</p>
          <span className="text-2xl font-bold tabular-nums text-blue-500">{openFindings}</span>
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
                        {finding.disposition !== "open" && (
                          <Badge variant="outline" className={cn("text-xs capitalize", dispositionColor(finding.disposition))}>
                            {dispositionIcon(finding.disposition)}
                            <span className="ml-1">{finding.disposition}</span>
                          </Badge>
                        )}
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

                    <div className="flex items-center gap-2 flex-wrap">
                      {finding.disposition === "open" && (
                        <>
                          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setDispositionDialog({ findingId: finding.id, disposition: "acknowledged" })}>
                            <Eye className="h-3 w-3 mr-1" />Acknowledge
                          </Button>
                          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setDispositionDialog({ findingId: finding.id, disposition: "dismissed" })}>
                            <XCircle className="h-3 w-3 mr-1" />Dismiss
                          </Button>
                          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setDispositionDialog({ findingId: finding.id, disposition: "fixed" })}>
                            <CheckCircle2 className="h-3 w-3 mr-1" />Fixed
                          </Button>
                        </>
                      )}
                      {finding.disposition !== "open" && (
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setDispositionDialog({ findingId: finding.id, disposition: "open" })}>
                          Reopen
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => toggleComments(finding.id)}>
                        <MessageSquare className="h-3 w-3 mr-1" />
                        {(commentsMap[finding.id]?.length ?? 0) > 0 ? `${commentsMap[finding.id]?.length}` : "Comment"}
                      </Button>
                    </div>

                    {expandedComments.has(finding.id) && (
                      <div className="space-y-2 border-t border-border pt-3 mt-2">
                        {(commentsMap[finding.id] || []).map((c) => (
                          <div key={c.id} className="flex gap-2">
                            <div className="h-6 w-6 rounded-full bg-secondary flex items-center justify-center text-[10px] font-bold text-foreground flex-shrink-0 mt-0.5">
                              {c.username.substring(0, 2).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-foreground">{c.username}</span>
                                <span className="text-[10px] text-muted-foreground">{new Date(c.created_at).toLocaleDateString()}</span>
                              </div>
                              <p className="text-xs text-foreground mt-0.5">{c.content}</p>
                            </div>
                          </div>
                        ))}
                        <div className="flex gap-2 mt-2">
                          <input
                            type="text"
                            placeholder="Add a comment..."
                            value={commentText[finding.id] || ""}
                            onChange={(e) => setCommentText((prev) => ({ ...prev, [finding.id]: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitComment(finding.id); } }}
                            className="flex-1 h-8 rounded-md border border-border bg-card px-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                          <Button size="sm" className="h-8 w-8 p-0" disabled={commentSubmitting[finding.id] || !(commentText[finding.id]?.trim())} onClick={() => submitComment(finding.id)}>
                            <Send className="h-3 w-3" />
                          </Button>
                        </div>
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

      <Dialog open={!!dispositionDialog} onOpenChange={(open) => { if (!open) { setDispositionDialog(null); setDispositionReason(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="capitalize">
              Mark as {dispositionDialog?.disposition}
            </DialogTitle>
            {dispositionDialog?.disposition !== "open" && (
              <DialogDescription>
                Optionally provide a reason for this change.
              </DialogDescription>
            )}
          </DialogHeader>
          {(dispositionDialog?.disposition === "dismissed" || dispositionDialog?.disposition === "fixed") && (
            <Textarea
              placeholder="Reason (optional)"
              value={dispositionReason}
              onChange={(e) => setDispositionReason(e.target.value)}
              rows={2}
              className="text-sm"
            />
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => { setDispositionDialog(null); setDispositionReason(""); }}>Cancel</Button>
            <Button onClick={handleDisposition} disabled={dispositionLoading}>
              {dispositionLoading ? "Updating..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
