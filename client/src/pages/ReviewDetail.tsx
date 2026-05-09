import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { type RootState, type AppDispatch } from "@/store";
import { fetchReviewDetail } from "@/store/reviewDetailSlice";
import type { Finding } from "@/types";
import { api } from "@/services/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Trash2, Mail, ChevronDown, ChevronUp, GitCommitHorizontal, GitBranch, Shield, FileSearch, Clock } from "lucide-react";
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

  useEffect(() => {
    if (id) dispatch(fetchReviewDetail(id));
  }, [id, dispatch]);

  if (loading) return <div className="space-y-4"><Skeleton className="h-32 w-full" /><Skeleton className="h-64 w-full" /></div>;
  if (!review) return <p className="py-8 text-center text-muted-foreground">Review not found</p>;

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

  const findingsBody = findings.length === 0
    ? "No issues found. The diff looks clean.\n"
    : `${sectionBlock("MUST FIX", grouped.must_fix)}${sectionBlock("SHOULD FIX SOON", grouped.should_fix_soon)}${sectionBlock("CAN IGNORE", grouped.ignore)}`;

  const emailBody = `Hi Team,

AutoReview completed a code review for ${repoName}.

─────────────────────────────────────────────
OVERVIEW
─────────────────────────────────────────────

${aiOverview}

─────────────────────────────────────────────
SUMMARY
─────────────────────────────────────────────
  Must Fix        : ${grouped.must_fix.length}
  Should Fix Soon : ${grouped.should_fix_soon.length}
  Can Ignore      : ${grouped.ignore.length}
  Total Findings  : ${findings.length}

─────────────────────────────────────────────
FINDINGS
─────────────────────────────────────────────

${findingsBody}─────────────────────────────────────────────

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

  const totalFindings = findings.length;
  const worstRisk = grouped.must_fix.length > 0 ? "critical" : grouped.should_fix_soon.length > 0 ? "warning" : "clean";

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">Review Detail</h2>
          <div className="flex items-center gap-2">
            {user?.role === "admin" && (
              <Button variant="outline" size="sm" className="border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Delete
              </Button>
            )}
            <Button variant="outline" size="sm" className="border-border bg-card hover:bg-accent" onClick={() => navigate("/")}>
              Back
            </Button>
          </div>
        </div>

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
                      <div className="flex gap-2 flex-shrink-0 mt-0.5">
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
    </div>
  );
}
