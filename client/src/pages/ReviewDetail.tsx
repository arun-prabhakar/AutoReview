import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { motion } from "motion/react";
import { type RootState, type AppDispatch } from "@/store";
import { fetchReviewDetail } from "@/store/reviewDetailSlice";
import { markReviewNotificationsRead } from "@/store/notificationsSlice";
import type { Finding, ReviewChainItem, ShareToken } from "@/types";
import { api } from "@/services/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { FAILURE_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { FindingCard } from "@/components/review/FindingCard";
import { CopyButton, EmptyState, Kbd, PageHeader, StatCard, StatusBadge, type SeverityLevel } from "@/components/shared";
import { fadeInUp, useReducedMotionVariants } from "@/lib/motion";
import { Trash2, Mail, ChevronDown, ChevronUp, ChevronRight, GitCommitHorizontal, GitBranch, Shield, FileSearch, Clock, RotateCcw, Coins, FileText, History, Share2, Link2, Copy, Check, AlertCircle, FileCode, Loader2, XCircle, Search, ShieldAlert, TriangleAlert, Info, ListChecks } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type DiffLineType = "file" | "meta" | "hunk" | "add" | "del" | "context";

interface DiffLine {
  key: string;
  type: DiffLineType;
  text: string;
  oldLine: number | null;
  newLine: number | null;
}

interface DiffSection {
  index: number;
  file: string;
  adds: number;
  dels: number;
  lines: DiffLine[];
}

function stripDiffPrefix(path: string): string {
  return path.replace(/^[ab]\//, "");
}

function parseUnifiedDiff(diffText: string): DiffSection[] {
  const sections: DiffSection[] = [];
  let current: DiffSection | null = null;
  let headerClosed = false; // current section consumed its "+++" line
  let hunkStarted = false;
  let oldLine = 0;
  let newLine = 0;
  let pendingOldPath = "";

  const startSection = (file = ""): DiffSection => {
    const section: DiffSection = { index: sections.length, file, adds: 0, dels: 0, lines: [] };
    current = section;
    headerClosed = false;
    hunkStarted = false;
    pendingOldPath = "";
    sections.push(section);
    return section;
  };

  diffText.split("\n").forEach((raw, i) => {
    if (raw.startsWith("diff --git ")) {
      const match = raw.match(/^diff --git a\/(.*) b\/(.*)$/);
      const section = startSection(match && match[2] ? match[2].trim() : "");
      section.lines.push({ key: `l${i}`, type: "file", text: raw, oldLine: null, newLine: null });
      return;
    }
    if (raw.startsWith("--- ")) {
      if (!current || headerClosed) startSection();
      if (!current) return;
      pendingOldPath = stripDiffPrefix(raw.slice(4).trim().split("\t")[0] ?? raw.slice(4).trim());
      current.lines.push({ key: `l${i}`, type: "meta", text: raw, oldLine: null, newLine: null });
      return;
    }
    if (raw.startsWith("+++ ")) {
      if (!current || headerClosed) startSection();
      if (!current) return;
      const filePath = raw.slice(4).trim().split("\t")[0];
      if (filePath === "/dev/null") {
        if (!current.file && pendingOldPath) current.file = pendingOldPath;
      } else if (!current.file && filePath) {
        current.file = stripDiffPrefix(filePath);
      }
      headerClosed = true;
      current.lines.push({ key: `l${i}`, type: "meta", text: raw, oldLine: null, newLine: null });
      return;
    }
    if (!current) return;
    if (!hunkStarted && raw.startsWith("@@")) {
      const match = raw.match(/^@+ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @/);
      if (match) {
        oldLine = parseInt(match[1] ?? "1", 10);
        newLine = parseInt(match[2] ?? "1", 10);
      }
      hunkStarted = true;
      current.lines.push({ key: `l${i}`, type: "hunk", text: raw, oldLine: null, newLine: null });
      return;
    }
    if (!hunkStarted) {
      current.lines.push({ key: `l${i}`, type: "meta", text: raw, oldLine: null, newLine: null });
      return;
    }
    if (raw.startsWith("+")) {
      current.lines.push({ key: `l${i}`, type: "add", text: raw, oldLine: null, newLine });
      newLine++;
      current.adds++;
    } else if (raw.startsWith("-")) {
      current.lines.push({ key: `l${i}`, type: "del", text: raw, oldLine, newLine: null });
      oldLine++;
      current.dels++;
    } else if (raw.startsWith("\\")) {
      current.lines.push({ key: `l${i}`, type: "meta", text: raw, oldLine: null, newLine: null });
    } else {
      current.lines.push({ key: `l${i}`, type: "context", text: raw, oldLine, newLine });
      oldLine++;
      newLine++;
    }
  });
  return sections;
}

function findDiffAnchor(sections: DiffSection[], filePath: string, lineNumber: number | null): string | null {
  const normalized = stripDiffPrefix(filePath);
  let sectionIndex = sections.findIndex((s) => s.file === normalized);
  if (sectionIndex === -1) {
    sectionIndex = sections.findIndex((s) => s.file.endsWith(`/${normalized}`));
  }
  const section = sectionIndex !== -1 ? sections[sectionIndex] : undefined;
  if (!section) return null;
  if (lineNumber != null) {
    if (section.lines.some((l) => l.newLine === lineNumber)) return `diff-line-${section.index}-n${lineNumber}`;
    if (section.lines.some((l) => l.oldLine === lineNumber)) return `diff-line-${section.index}-o${lineNumber}`;
  }
  return `diff-section-${section.index}`;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const diffRowClasses: Record<DiffLineType, string> = {
  file: "text-muted-foreground/60",
  meta: "text-muted-foreground/70",
  hunk: "bg-secondary text-muted-foreground",
  add: "bg-success/10",
  del: "bg-destructive/10",
  context: "",
};

function DiffViewer({ sections, highlightId }: { sections: DiffSection[]; highlightId: string | null }) {
  return (
    <div className="mt-4 space-y-4" aria-label="Reviewed changes">
      {sections.map((section) => (
        <div key={section.index} id={`diff-section-${section.index}`}>
          <div className="sticky top-0 z-10 flex items-center gap-2 rounded-t-lg border border-b border-border bg-card/95 px-3 py-2 backdrop-blur-sm">
            <FileCode className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="truncate font-mono text-xs text-foreground" title={section.file}>{section.file}</span>
            <span className="ml-auto flex shrink-0 items-center gap-2 font-mono text-xs font-medium tabular-nums">
              <span className="text-success">+{section.adds}</span>
              <span className="text-destructive">−{section.dels}</span>
            </span>
          </div>
          <div className="overflow-x-auto rounded-b-lg border border-t-0 border-border bg-card">
            <div className="w-max min-w-full font-mono text-xs leading-relaxed">
              {section.lines.map((line) => {
                const anchorId = line.newLine != null
                  ? `diff-line-${section.index}-n${line.newLine}`
                  : line.oldLine != null
                    ? `diff-line-${section.index}-o${line.oldLine}`
                    : undefined;
                const highlighted = anchorId != null && anchorId === highlightId;
                return (
                  <div
                    key={line.key}
                    id={anchorId}
                    className={cn(
                      "flex transition-colors duration-300",
                      diffRowClasses[line.type],
                      highlighted && "bg-accent ring-1 ring-inset ring-ring"
                    )}
                  >
                    <span className="w-12 shrink-0 select-none border-r border-border/60 pr-2 text-right text-muted-foreground/50">{line.oldLine ?? ""}</span>
                    <span className="w-12 shrink-0 select-none border-r border-border/60 pr-2 text-right text-muted-foreground/50">{line.newLine ?? ""}</span>
                    <span className="whitespace-pre px-3">{line.text || " "}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

type GroupMode = "severity" | "file";
const GROUP_MODE_STORAGE_KEY = "autoreview:review-detail:group-mode";
const KNOWN_CATEGORIES = ["security", "performance", "correctness", "maintainability", "style"];
const SEVERITY_LEVELS: SeverityLevel[] = ["must_fix", "should_fix_soon", "ignore"];

interface FileGroup {
  path: string;
  items: Finding[];
  hasMustFix: boolean;
  hasShouldFix: boolean;
}

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
  const [cancelling, setCancelling] = useState(false);
  const [chain, setChain] = useState<ReviewChainItem[]>([]);
  const [chainVisible, setChainVisible] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareExpiry, setShareExpiry] = useState(0);
  const [shareData, setShareData] = useState<ShareToken | null>(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [diffVisible, setDiffVisible] = useState(false);
  const [aiResponseOpen, setAiResponseOpen] = useState(false);
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [aiResponseLoading, setAiResponseLoading] = useState(false);
  const [findingSearch, setFindingSearch] = useState("");
  const [findingStatus, setFindingStatus] = useState("open");
  const [findingLimit, setFindingLimit] = useState(10);
  const [selectedCategories, setSelectedCategories] = useState<ReadonlySet<string>>(new Set());
  const [groupMode, setGroupMode] = useState<GroupMode>(() => {
    try {
      return window.localStorage.getItem(GROUP_MODE_STORAGE_KEY) === "file" ? "file" : "severity";
    } catch {
      return "severity";
    }
  });
  const [collapsedFiles, setCollapsedFiles] = useState<ReadonlySet<string>>(new Set());
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [pendingAnchor, setPendingAnchor] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [pendingGroupScroll, setPendingGroupScroll] = useState<SeverityLevel | null>(null);

  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const keyboardIdsRef = useRef<string[]>([]);
  const highlightTimer = useRef<number | undefined>(undefined);
  const cardVariants = useReducedMotionVariants(fadeInUp);

  useEffect(() => {
    if (id) dispatch(fetchReviewDetail(id));
  }, [id, dispatch]);

  useEffect(() => {
    if (!id || review?.status !== "pending") return;
    const timer = window.setInterval(() => dispatch(fetchReviewDetail(id)), 3000);
    return () => window.clearInterval(timer);
  }, [id, review?.status, dispatch]);

  useEffect(() => {
    if (id) dispatch(markReviewNotificationsRead(id));
  }, [id, dispatch]);

  useEffect(() => { setFindingLimit(10); }, [findingSearch, findingStatus, selectedCategories]);

  useEffect(() => {
    try { window.localStorage.setItem(GROUP_MODE_STORAGE_KEY, groupMode); } catch { /* storage unavailable */ }
  }, [groupMode]);

  useEffect(() => {
    if (id) {
      api.get<ReviewChainItem[]>(`/api/reviews/${id}/chain`).then(setChain).catch(() => {});
    }
  }, [id]);

  useEffect(() => () => window.clearTimeout(highlightTimer.current), []);

  const diffSections = useMemo(
    () => (review?.diff_text ? parseUnifiedDiff(review.diff_text) : []),
    [review?.diff_text]
  );

  /* Diff jump-links: expand, scroll, and flash the target line. */
  useEffect(() => {
    if (!diffVisible || !pendingAnchor) return;
    const frame = window.requestAnimationFrame(() => {
      const el = document.getElementById(pendingAnchor);
      if (el) {
        el.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "center" });
        if (pendingAnchor.startsWith("diff-line-")) {
          setHighlightId(pendingAnchor);
          window.clearTimeout(highlightTimer.current);
          highlightTimer.current = window.setTimeout(() => setHighlightId(null), 2200);
        }
      }
      setPendingAnchor(null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [diffVisible, pendingAnchor]);

  /* Severity stat cards scroll to the matching group; this effect waits for the
     group (and any filter resets from the same batch) to land in the DOM first. */
  useEffect(() => {
    if (!pendingGroupScroll || groupMode !== "severity") return;
    const frame = window.requestAnimationFrame(() => {
      const el = document.getElementById(`severity-group-${pendingGroupScroll}`);
      if (el) el.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
      setPendingGroupScroll(null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pendingGroupScroll, groupMode]);

  const handleViewInDiff = (finding: Finding) => {
    setDiffVisible(true);
    const anchor = findDiffAnchor(diffSections, finding.file_path, finding.line_number);
    if (!anchor) {
      toast({ title: "File not found in diff", description: finding.file_path });
      return;
    }
    setPendingAnchor(anchor);
  };

  const handleSeverityStatClick = (level: SeverityLevel) => {
    setGroupMode("severity");
    if (grouped[level].length === 0) {
      setFindingSearch("");
      setSelectedCategories(new Set());
      setFindingStatus("all");
    }
    setPendingGroupScroll(level);
  };

  const handleRereview = async () => {
    if (!id) return;
    setRereviewing(true);
    try {
      const result = await api.postStream<{ reviewId: string }>(`/api/reviews/${id}/rereview/stream`, {});
      toast({ title: "Re-review completed", description: "The new review is ready.", variant: "success" });
      navigate(`/reviews/${result.reviewId}`);
    } catch (err) {
      toast({ title: "Re-review failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setRereviewing(false);
      setRereviewOpen(false);
    }
  };

  const handleCancel = async () => {
    if (!id) return;
    setCancelling(true);
    try {
      await api.post(`/api/reviews/${id}/cancel`, {});
      toast({ title: "Cancellation requested", description: "The review will stop at the next pipeline checkpoint." });
      dispatch(fetchReviewDetail(id));
    } catch (err) {
      toast({ title: "Cancellation failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setCancelling(false);
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

  const handleOpenAiResponse = async () => {
    if (!id) return;
    setAiResponseOpen(true);
    if (aiResponse !== null) return;

    setAiResponseLoading(true);
    try {
      const result = await api.get<{ ai_response: string }>(`/api/reviews/${id}/ai-response`);
      setAiResponse(result.ai_response || "");
    } catch (err) {
      toast({ title: "Failed to load AI response", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
      setAiResponseOpen(false);
    } finally {
      setAiResponseLoading(false);
    }
  };

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

  const updateDisposition = async (findingId: string, disposition: "open" | "resolved" | "false_positive" | "accepted_risk") => {
    if (!id) return;
    try {
      await api.patch(`/api/reviews/${id}/findings/${findingId}`, { disposition });
      await dispatch(fetchReviewDetail(id));
      toast({ title: disposition === "open" ? "Finding reopened" : "Finding updated", variant: "success" });
    } catch (err) {
      toast({ title: "Could not update finding", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
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

  const visibleFindings = findings.filter((finding) => {
    const matchesStatus = findingStatus === "all" || (finding.disposition || "open") === findingStatus;
    const matchesCategory = selectedCategories.size === 0 || (finding.category != null && selectedCategories.has(finding.category));
    const query = findingSearch.trim().toLowerCase();
    return matchesStatus && matchesCategory && (!query || `${finding.summary} ${finding.file_path} ${finding.category || ""}`.toLowerCase().includes(query));
  });
  const grouped: Record<SeverityLevel, Finding[]> = {
    must_fix: visibleFindings.filter((f) => f.risk_level === "must_fix"),
    should_fix_soon: visibleFindings.filter((f) => f.risk_level === "should_fix_soon"),
    ignore: visibleFindings.filter((f) => f.risk_level === "ignore"),
  };

  const displayedFindings = visibleFindings.filter((_, idx) => idx < findingLimit);
  const displayedBySeverity: Record<SeverityLevel, Finding[]> = {
    must_fix: displayedFindings.filter((f) => f.risk_level === "must_fix"),
    should_fix_soon: displayedFindings.filter((f) => f.risk_level === "should_fix_soon"),
    ignore: displayedFindings.filter((f) => f.risk_level === "ignore"),
  };

  const fileGroups: FileGroup[] = (() => {
    const byPath = new Map<string, Finding[]>();
    for (const finding of displayedFindings) {
      const list = byPath.get(finding.file_path);
      if (list) list.push(finding);
      else byPath.set(finding.file_path, [finding]);
    }
    const groups: FileGroup[] = Array.from(byPath.entries()).map(([path, items]) => ({
      path,
      items,
      hasMustFix: items.some((f) => f.risk_level === "must_fix"),
      hasShouldFix: items.some((f) => f.risk_level === "should_fix_soon"),
    }));
    groups.sort((a, b) =>
      Number(b.hasMustFix) - Number(a.hasMustFix) ||
      Number(b.hasShouldFix) - Number(a.hasShouldFix) ||
      b.items.length - a.items.length ||
      a.path.localeCompare(b.path)
    );
    return groups;
  })();

  const keyboardIds = groupMode === "severity"
    ? SEVERITY_LEVELS.flatMap((level) => displayedBySeverity[level].map((f) => f.id))
    : fileGroups.filter((g) => !collapsedFiles.has(g.path)).flatMap((g) => g.items.map((f) => f.id));
  keyboardIdsRef.current = keyboardIds;

  const toggleFileGroup = (path: string) => {
    setCollapsedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const toggleCategory = (category: string) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  /* Keyboard navigation: j/k or arrows move between finding cards, Escape blurs filters. */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const isFormTarget = (el: HTMLElement | null): boolean =>
        !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);

      if (event.key === "Escape") {
        if (isFormTarget(target)) target?.blur();
        return;
      }
      const isNext = event.key === "j" || event.key === "ArrowDown";
      const isPrev = event.key === "k" || event.key === "ArrowUp";
      if (!isNext && !isPrev) return;
      if (isFormTarget(target) || target?.closest('[role="dialog"]')) return;

      const ids = keyboardIdsRef.current;
      if (ids.length === 0) return;
      event.preventDefault();
      const currentIndex = focusedId != null ? ids.indexOf(focusedId) : -1;
      const nextIndex = currentIndex === -1
        ? (isNext ? 0 : ids.length - 1)
        : (isNext ? Math.min(currentIndex + 1, ids.length - 1) : Math.max(currentIndex - 1, 0));
      const nextId = ids[nextIndex];
      if (nextId === undefined) return;
      setFocusedId(nextId);
      const el = cardRefs.current.get(nextId);
      if (el) {
        el.focus({ preventScroll: true });
        el.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "nearest" });
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [focusedId]);

  const isPrReview = String(review.commit_hash).startsWith("pr:");
  const prId = isPrReview ? String(review.commit_hash).split(":")[1] : null;
  const reviewedCommit = isPrReview ? String(review.commit_hash).split(":")[2] : String(review.commit_hash);
  const shortHash = String(reviewedCommit).substring(0, 8);
  const repoName = String(review.repository_name || review.repository_id);
  const branch = String(review.branch || "N/A");
  const aiOverview = String(review.ai_overview || "Review completed.");
  const formattedAiResponse = (() => {
    if (!aiResponse) return "";
    try {
      return JSON.stringify(JSON.parse(aiResponse), null, 2);
    } catch {
      return aiResponse;
    }
  })();

  const totalFindings = findings.length;
  const durationSeconds = review.completed_at ? Math.max(0, Math.round((new Date(review.completed_at).getTime() - new Date(review.created_at).getTime()) / 1000)) : null;
  const worstRisk = grouped.must_fix.length > 0 ? "critical" : grouped.should_fix_soon.length > 0 ? "warning" : "clean";

  const presentCategories = Array.from(new Set(findings.map((f) => f.category).filter((c): c is string => c != null)));
  const categoryOrder = [
    ...KNOWN_CATEGORIES.filter((c) => presentCategories.includes(c)),
    ...presentCategories.filter((c) => !KNOWN_CATEGORIES.includes(c)).sort(),
  ];
  const categoryCount = (category: string) => findings.filter((f) => f.category === category).length;

  const tabbableId = focusedId != null && keyboardIds.includes(focusedId) ? focusedId : keyboardIds[0];

  const renderFindingCard = (finding: Finding) => (
    <motion.div
      key={finding.id}
      role="listitem"
      ref={(el) => {
        if (el) cardRefs.current.set(finding.id, el);
        else cardRefs.current.delete(finding.id);
      }}
      tabIndex={tabbableId === finding.id ? 0 : -1}
      onFocus={() => setFocusedId(finding.id)}
      className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      variants={cardVariants}
      initial="hidden"
      animate="visible"
    >
      <FindingCard
        {...finding}
        sourceUrl={review.repository_workspace && review.repository_slug ? `https://bitbucket.org/${review.repository_workspace}/${review.repository_slug}/src/${reviewedCommit}/${finding.file_path}${finding.line_number ? `#lines-${finding.line_number}` : ""}` : undefined}
        onDisposition={(disposition) => updateDisposition(finding.id, disposition)}
        onViewInDiff={review.diff_text ? () => handleViewInDiff(finding) : undefined}
      />
    </motion.div>
  );

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
    : "(none)";

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

═════════════════════════════════════════════════
  RISK ASSESSMENT: ${riskAssessment}
═════════════════════════════════════════════════

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

${findingsBody}════════════════════════════════════════════════

This review was generated automatically by AutoReview.
Review findings are AI-generated and should be validated by a human reviewer.

Regards,
AutoReview`;

  return (
    <div className="space-y-4">
      <PageHeader
        title={isPrReview ? `Pull Request #${prId}` : `Commit ${shortHash}`}
        description={
          <span>
            {review.completed_at ? formatDate(String(review.completed_at)) : formatDate(review.created_at)}
            {review.commit_author && ` · by ${review.commit_author}`}
            {` · ${String(review.review_mode)} review`}
          </span>
        }
        breadcrumb={
          <span className="flex items-center gap-1.5">
            <button type="button" onClick={() => navigate("/")} className="hover:text-foreground transition-colors">Dashboard</button>
            <ChevronRight className="h-3 w-3 shrink-0" aria-hidden="true" />
            <button type="button" onClick={() => navigate("/")} className="max-w-[180px] truncate hover:text-foreground transition-colors" title={repoName}>{repoName}</button>
            <ChevronRight className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="font-mono">{isPrReview ? `#${prId}` : shortHash}</span>
            <CopyButton
              value={String(reviewedCommit)}
              label="Copy full commit hash"
              toastLabel="Commit hash"
              className="h-5 w-5 [&_svg]:size-3"
            />
          </span>
        }
        actions={
          <>
            {review?.status === "pending" && (
              <Button variant="outline" size="sm" onClick={handleCancel} disabled={cancelling}>
                {cancelling ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5 mr-1.5" />}
                Cancel
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={shareData ? undefined : () => setShareOpen(true)} disabled={shareLoading}>
              <Share2 className="h-3.5 w-3.5 mr-1.5" />
              {shareLoading ? "Sharing..." : "Share"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setRereviewOpen(true)} disabled={rereviewing || review?.status === "pending"}>
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              {rereviewing ? "Reviewing..." : review?.status === "failed" || review?.status === "cancelled" ? "Retry" : "Re-review"}
            </Button>
            {user?.role === "admin" && (
              <Button variant="outline" size="sm" onClick={handleOpenAiResponse}>
                <FileCode className="h-3.5 w-3.5 mr-1.5" />
                AI Response
              </Button>
            )}
            {user?.role === "admin" && (
              <Button variant="outline" size="sm" className="border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Delete
              </Button>
            )}
          </>
        }
      />

      {shareData && (
        <Card className="border-border bg-card">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-3">
              <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0", shareData.enabled ? "bg-success/10" : "bg-muted")}>
                <Link2 className={cn("h-4 w-4", shareData.enabled ? "text-success" : "text-muted-foreground")} />
              </div>
              <div className="flex-1 min-w-0 flex items-center gap-2">
                <code className="text-xs font-mono text-interactive truncate flex-1 block">
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
      {review.status === "pending" && (
        <div className="rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 flex items-center gap-3">
          <Loader2 className="h-4 w-4 animate-spin text-warning" />
          <div><p className="text-sm font-semibold">{review.progress_stage || "AI review is running"}</p><p className="text-xs text-muted-foreground">This page updates automatically. You can leave and return without losing the review.</p></div>
        </div>
      )}

      {chain.length > 1 && (
        <Card className="border-border bg-card">
          <button
            onClick={() => setChainVisible(!chainVisible)}
            aria-expanded={chainVisible}
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
                      <span className="text-muted-foreground">{formatDate(item.created_at)} {new Date(item.created_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false })}</span>
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

      <div className="flex flex-col lg:flex-row gap-6">
        <section className="w-full lg:w-[42%] min-w-0 space-y-4" aria-label="Findings">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <StatCard
              label="Must fix"
              value={grouped.must_fix.length}
              tone="critical"
              icon={<ShieldAlert />}
              className="p-4 [&>p:last-child]:text-xl"
              onClick={() => handleSeverityStatClick("must_fix")}
            />
            <StatCard
              label="Should fix"
              value={grouped.should_fix_soon.length}
              tone="warning"
              icon={<TriangleAlert />}
              className="p-4 [&>p:last-child]:text-xl"
              onClick={() => handleSeverityStatClick("should_fix_soon")}
            />
            <StatCard
              label="Ignored"
              value={grouped.ignore.length}
              icon={<Info />}
              className="p-4 [&>p:last-child]:text-xl"
              onClick={() => handleSeverityStatClick("ignore")}
            />
            <StatCard
              label="Total"
              value={totalFindings}
              icon={<ListChecks />}
              className="p-4 [&>p:last-child]:text-xl"
            />
          </div>

          <Card className="border-border bg-card">
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative flex-1">
                  <label htmlFor="finding-search" className="sr-only">Search findings or files</label>
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input id="finding-search" value={findingSearch} onChange={(e) => setFindingSearch(e.target.value)} placeholder="Search findings or files" className="pl-9" />
                </div>
                <label htmlFor="finding-status" className="sr-only">Finding status</label>
                <select id="finding-status" value={findingStatus} onChange={(e) => setFindingStatus(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="open">Open findings</option>
                  <option value="resolved">Resolved</option>
                  <option value="false_positive">False positives</option>
                  <option value="accepted_risk">Accepted risks</option>
                  <option value="all">All findings</option>
                </select>
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <div role="group" aria-label="Group findings by" className="inline-flex h-8 items-center rounded-lg border border-border bg-secondary p-0.5">
                  <button
                    type="button"
                    aria-pressed={groupMode === "severity"}
                    onClick={() => setGroupMode("severity")}
                    className={cn(
                      "h-7 rounded-md px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      groupMode === "severity" ? "bg-card text-foreground shadow-[inset_0_-2px_0_hsl(var(--interactive))]" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    By Severity
                  </button>
                  <button
                    type="button"
                    aria-pressed={groupMode === "file"}
                    onClick={() => setGroupMode("file")}
                    className={cn(
                      "h-7 rounded-md px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      groupMode === "file" ? "bg-card text-foreground shadow-[inset_0_-2px_0_hsl(var(--interactive))]" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    By File
                  </button>
                </div>

                {categoryOrder.length > 0 && (
                  <div role="group" aria-label="Filter by category" className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      aria-pressed={selectedCategories.size === 0}
                      onClick={() => setSelectedCategories(new Set())}
                      className={cn(
                        "inline-flex h-7 items-center rounded-full border px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        selectedCategories.size === 0
                          ? "border-interactive/40 bg-interactive/10 text-interactive"
                          : "border-border text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground"
                      )}
                    >
                      All
                    </button>
                    {categoryOrder.map((category) => {
                      const active = selectedCategories.has(category);
                      return (
                        <button
                          key={category}
                          type="button"
                          aria-pressed={active}
                          onClick={() => toggleCategory(category)}
                          className={cn(
                            "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            active
                              ? "border-interactive/40 bg-interactive/10 text-interactive"
                              : "border-border text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground"
                          )}
                        >
                          {category}
                          <span className="tabular-nums opacity-70">{categoryCount(category)}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {visibleFindings.length > 0 && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Kbd>j</Kbd>
                  <Kbd>k</Kbd>
                  <span>or arrow keys move between findings · Escape leaves the search field</span>
                </p>
              )}
            </CardContent>
          </Card>

          {groupMode === "severity" && SEVERITY_LEVELS.map((level) => {
            const items = grouped[level];
            const displayedItems = displayedBySeverity[level];
            if (displayedItems.length === 0) return null;
            return (
              <div key={level} id={`severity-group-${level}`} className="space-y-3 scroll-mt-4">
                <div className="flex items-center gap-3 pt-2">
                  <div className={cn(
                    "h-3 w-3 rounded-full",
                    level === "must_fix" ? "bg-destructive" : level === "should_fix_soon" ? "bg-warning" : "bg-muted-foreground"
                  )} />
                  <h3 className="text-lg font-bold tracking-tight capitalize text-foreground">{level.replace(/_/g, " ")}</h3>
                  <span className="text-xs text-muted-foreground">{items.length} {items.length === 1 ? "finding" : "findings"}</span>
                </div>
                <div role="list" aria-label={`${level.replace(/_/g, " ")} findings`} className="space-y-3">
                  {displayedItems.map(renderFindingCard)}
                </div>
              </div>
            );
          })}

          {groupMode === "file" && fileGroups.map((group, groupIndex) => {
            const collapsed = collapsedFiles.has(group.path);
            return (
              <div key={group.path} className="space-y-3">
                <button
                  type="button"
                  onClick={() => toggleFileGroup(group.path)}
                  aria-expanded={!collapsed}
                  aria-controls={`file-group-${groupIndex}`}
                  className="flex w-full items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ChevronDown
                    className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-fast", collapsed && "-rotate-90")}
                    aria-hidden="true"
                  />
                  <FileCode className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="truncate font-mono text-xs text-foreground" title={group.path}>{group.path}</span>
                  <span className="ml-auto flex shrink-0 items-center gap-2.5">
                    <span
                      aria-hidden="true"
                      className={cn(
                        "h-2 w-2 rounded-full",
                        group.hasMustFix ? "bg-destructive" : group.hasShouldFix ? "bg-warning" : "bg-muted-foreground"
                      )}
                    />
                    <Badge variant="outline" className="tabular-nums">
                      {group.items.length} {group.items.length === 1 ? "finding" : "findings"}
                    </Badge>
                  </span>
                </button>
                {!collapsed && (
                  <div id={`file-group-${groupIndex}`} role="list" aria-label={`Findings in ${group.path}`} className="space-y-3">
                    {group.items.map(renderFindingCard)}
                  </div>
                )}
              </div>
            );
          })}

          {visibleFindings.length > findingLimit && <Button variant="outline" className="w-full" onClick={() => setFindingLimit((limit) => limit + 10)}>Show 10 more findings</Button>}
          {visibleFindings.length === 0 && (
            <div className="rounded-lg border border-dashed border-border">
              <EmptyState
                icon={<Search />}
                title="No findings match the current filters."
                description="Adjust the search, status, or category filters to see more findings."
              />
            </div>
          )}
        </section>

        <div className="flex-1 min-w-0 space-y-4">
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
                    <h3 className="font-semibold text-foreground break-words">{repoName}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {isPrReview ? `Pull Request #${prId}` : "Commit Review"}
                      {review.commit_author && ` · by ${review.commit_author}`}
                      {review.completed_at && ` · ${formatDate(String(review.completed_at))}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {review.incremental && <Badge variant="outline">Incremental</Badge>}
                  {review.policy_status && <Badge variant={review.policy_status === "passed" ? "default" : "destructive"}>Policy {review.policy_status}</Badge>}
                  <StatusBadge status={review.status} />
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2">
                  <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Branch</p>
                    <p className="text-sm font-medium text-foreground break-all">{branch}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2">
                  <GitCommitHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Commit</p>
                    <p className="text-sm font-mono text-foreground">{isPrReview ? `PR #${prId}` : shortHash}</p>
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
                  {durationSeconds != null && <div className="flex items-center gap-1.5 rounded-md bg-secondary px-2.5 py-1 text-xs"><Clock className="h-3 w-3 text-muted-foreground" /><span className="text-muted-foreground">{durationSeconds < 60 ? `${durationSeconds}s` : `${Math.floor(durationSeconds / 60)}m ${durationSeconds % 60}s`}</span></div>}
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
                <div className="flex items-center gap-2">
                  {diffVisible && (
                    <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                      <CopyButton value={review.diff_text} label="Copy diff" toastLabel="Diff" />
                    </span>
                  )}
                  {diffVisible ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </div>
              </button>
              {diffVisible && (
                <CardContent id="diff-content" className="pt-0 pb-4 border-t border-border">
                  <DiffViewer sections={diffSections} highlightId={highlightId} />
                </CardContent>
              )}
            </Card>
          )}

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
                <div className="flex items-center gap-2">
                  {emailVisible && (
                    <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                      <CopyButton value={emailBody} label="Copy email draft" toastLabel="Email draft" />
                    </span>
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
        </div>
      </div>

      <Dialog open={aiResponseOpen} onOpenChange={setAiResponseOpen}>
        <DialogContent className="sm:max-w-5xl h-[86vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileCode className="h-4 w-4" />
              AI Response
            </DialogTitle>
            <DialogDescription className="pt-1">
              Raw model output captured for this review. Only admins can view it.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-secondary/50">
            {aiResponseLoading ? (
              <div className="p-4 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
              </div>
            ) : formattedAiResponse ? (
              <div className="h-full max-h-full overflow-auto">
                <pre className="min-w-max whitespace-pre p-4 text-xs font-mono leading-relaxed text-foreground">{formattedAiResponse}</pre>
              </div>
            ) : (
              <p className="p-4 text-sm text-muted-foreground">No AI response was stored for this review.</p>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0" aria-live="polite">
            <CopyButton
              variant="outline"
              value={formattedAiResponse}
              label="Copy AI response"
              toastLabel="AI response"
              disabled={!formattedAiResponse}
            />
            <Button variant="outline" onClick={() => setAiResponseOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      <Dialog open={rereviewOpen} onOpenChange={(open) => {
        if (!rereviewing) setRereviewOpen(open);
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {rereviewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              {rereviewing ? (isPrReview ? "Reviewing PR" : "Reviewing Commit") : "Re-review"}
            </DialogTitle>
            <DialogDescription className="pt-1">
              {rereviewing
                ? `AutoReview is analyzing the latest ${isPrReview ? "PR" : "commit"} diff. This dialog will stay open until the review finishes.`
                : "Trigger a new review for the same commit/PR. The previous review will be preserved in the history chain."}
            </DialogDescription>
          </DialogHeader>
          {rereviewing && (
            <div className="rounded-lg border border-border bg-secondary/60 px-4 py-3">
              <div className="flex items-center gap-3">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium text-foreground">Review in progress</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Please keep this page open while the request completes.</p>
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setRereviewOpen(false)} disabled={rereviewing}>Cancel</Button>
            <Button onClick={handleRereview} disabled={rereviewing}>
              {rereviewing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Reviewing...
                </>
              ) : "Start Re-review"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
