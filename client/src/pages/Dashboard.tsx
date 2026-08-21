import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "motion/react";
import { type RootState, type AppDispatch } from "@/store";
import { fetchReviews } from "@/store/reviewsSlice";
import { fetchRepositories } from "@/store/repositoriesSlice";
import { api } from "@/services/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHead, TableHeader, TableRow, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ToastAction } from "@/components/ui/toast";
import {
  CopyButton,
  EmptyState,
  ErrorState,
  Kbd,
  PageHeader,
  SeverityBadge,
  StatCard,
  StatusBadge,
  TableSkeleton,
  CardsSkeleton,
  type StatCardTone,
} from "@/components/shared";
import { cn } from "@/lib/utils";
import { FAILURE_LABELS } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import { fadeIn, fadeInUp, staggerContainer, useReducedMotionVariants } from "@/lib/motion";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileSearch,
  GitCommit,
  GitPullRequest,
  Minus,
  RotateCw,
  Search,
  SearchX,
  Trash2,
  User,
  X,
  XCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Review } from "@/types";

const PAGE_SIZE = 10;

type SortKey = "created" | "repository";
type SortDir = "asc" | "desc";

function formatRelativeTime(dt: string): string {
  const diffSec = Math.round((Date.now() - new Date(dt).getTime()) / 1000);
  if (diffSec < 45) return "just now";
  const units: Array<[string, number]> = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, secs] of units) {
    if (diffSec >= secs) {
      const n = Math.floor(diffSec / secs);
      return `${n} ${unit}${n !== 1 ? "s" : ""} ago`;
    }
  }
  const mins = Math.max(1, Math.floor(diffSec / 60));
  return `${mins} minute${mins !== 1 ? "s" : ""} ago`;
}

function repoName(review: Review): string {
  return review.repository_name || review.repository_id;
}

function identifierText(review: Pick<Review, "commit_hash" | "review_mode">): string {
  if (review.review_mode === "pr" || review.commit_hash?.startsWith("pr:")) {
    return `#${review.commit_hash?.replace("pr:", "") ?? ""}`;
  }
  return (review.commit_hash ?? "").substring(0, 10);
}

function isPrReview(review: Pick<Review, "commit_hash" | "review_mode">): boolean {
  return review.review_mode === "pr" || review.commit_hash?.startsWith("pr:");
}

function authorInitials(author: string): string {
  return author
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0))
    .join("")
    .substring(0, 2)
    .toUpperCase();
}

function failureLabel(review: Review): string | undefined {
  if (review.status !== "failed" && review.status !== "cancelled") return undefined;
  return review.failure_category ? FAILURE_LABELS[review.failure_category] : undefined;
}

function TypeMark({ review }: { review: Review }) {
  const Icon = isPrReview(review) ? GitPullRequest : GitCommit;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
      <Icon className="h-3.5 w-3.5" />
      {isPrReview(review) ? "PR" : "Commit"}
    </span>
  );
}

function AuthorAvatar({ author, className }: { author: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-[9px] font-bold text-foreground",
        className
      )}
      title={author}
    >
      {authorInitials(author)}
    </span>
  );
}

function SeverityDots({ review }: { review: Review }) {
  if (review.status !== "completed") return null;
  const must = review.must_fix_count ?? 0;
  const should = review.should_fix_count ?? 0;
  if (must === 0 && should === 0) {
    return (
      <span className="inline-flex items-center gap-1" title="No issues found">
        <span className="h-1.5 w-1.5 rounded-full bg-success" />
      </span>
    );
  }
  const dots = [
    ...Array.from({ length: Math.min(must, 4) }, () => "destructive" as const),
    ...Array.from({ length: Math.min(should, 4) }, () => "warning" as const),
  ];
  const overflow = must + should - dots.length;
  return (
    <span className="inline-flex items-center gap-1" title={`${must} must-fix, ${should} should-fix`}>
      {dots.map((tone, i) => (
        <span key={i} className={cn("h-1.5 w-1.5 rounded-full", tone === "destructive" ? "bg-destructive" : "bg-warning")} />
      ))}
      {overflow > 0 && <span className="text-xs leading-none text-muted-foreground">+{overflow}</span>}
    </span>
  );
}

function SelectAllCheckbox({
  checked,
  indeterminate,
  disabled,
  onChange,
}: {
  checked: boolean;
  indeterminate: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      className="h-4 w-4 cursor-pointer rounded-[4px] border border-muted-foreground/40 accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-50"
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
      onClick={(e) => e.stopPropagation()}
      aria-label="Select all reviews on this page"
    />
  );
}

const checkboxInputClass =
  "h-4 w-4 cursor-pointer rounded-[4px] border border-muted-foreground/40 accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export default function Dashboard() {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const {
    items: reviews,
    loading,
    total,
    statusCounts,
    initialLoad,
    error: reviewsError,
  } = useSelector((state: RootState) => state.reviews);
  const { items: repos } = useSelector((state: RootState) => state.repositories);
  const user = useSelector((state: RootState) => state.auth.user);
  const isAdmin = user?.role === "admin";

  const [searchParams, setSearchParams] = useSearchParams();

  const filterRepo = searchParams.get("repo") ?? "all";
  const filterType = searchParams.get("type") ?? "all";
  const filterAuthors = useMemo(
    () => (searchParams.get("authors")?.split(",").filter(Boolean) ?? []),
    [searchParams]
  );
  const statusFilter = searchParams.get("status") ?? "all";
  const query = searchParams.get("q") ?? "";
  const sortKey: SortKey = searchParams.get("sort") === "repository" ? "repository" : "created";
  const sortDir: SortDir = searchParams.get("dir") === "asc" ? "asc" : "desc";
  const pageParam = parseInt(searchParams.get("page") ?? "1", 10);
  const page = Number.isFinite(pageParam) && pageParam > 1 ? pageParam - 1 : 0;

  const [authorOptions, setAuthorOptions] = useState<string[]>([]);
  const [authorDropdownOpen, setAuthorDropdownOpen] = useState(false);
  const [authorSearch, setAuthorSearch] = useState("");
  const authorDropdownRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<Review | null>(null);
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const authorsKey = filterAuthors.join(",");
  const hasActiveFilters =
    filterRepo !== "all" || filterType !== "all" || filterAuthors.length > 0 || statusFilter !== "all" || query !== "";

  const updateParams = useCallback(
    (patch: Record<string, string | null>) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(patch)) {
            if (value === null || value === "" || value === "all") next.delete(key);
            else next.set(key, value);
          }
          if (!("page" in patch)) next.delete("page");
          return next;
        },
        { replace: false }
      );
    },
    [setSearchParams]
  );

  const fetchArgs = useCallback(() => {
    return {
      ...(filterRepo !== "all" ? { repository_id: filterRepo } : {}),
      ...(filterType !== "all" ? { review_mode: filterType } : {}),
      ...(statusFilter !== "all" ? { status: statusFilter } : {}),
      ...(filterAuthors.length > 0 ? { commit_author: filterAuthors } : {}),
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    };
  }, [filterRepo, filterType, statusFilter, authorsKey, page]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    dispatch(fetchReviews(fetchArgs()));
  }, [dispatch, fetchArgs]);

  useEffect(() => {
    dispatch(fetchRepositories());
  }, [dispatch]);

  useEffect(() => {
    const fetchAuthors = async () => {
      const requestQuery = new URLSearchParams();
      if (filterRepo !== "all") requestQuery.set("repository_id", filterRepo);
      if (filterType !== "all") requestQuery.set("review_mode", filterType);
      const authors = await api.get<string[]>(`/api/reviews/authors?${requestQuery.toString()}`);
      setAuthorOptions(authors);
      const selected = (searchParams.get("authors")?.split(",").filter(Boolean) ?? []).filter((author) =>
        authors.includes(author)
      );
      if (selected.join(",") !== (searchParams.get("authors") ?? "")) {
        updateParams({ authors: selected.length > 0 ? selected.join(",") : null });
      }
    };

    fetchAuthors().catch((err) => {
      toast({
        title: "Failed to load authors",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    });
  }, [filterRepo, filterType, updateParams]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (authorDropdownRef.current && !authorDropdownRef.current.contains(event.target as Node)) {
        setAuthorDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/") return;
      const target = event.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable=true], button, [role='listbox']")) return;
      event.preventDefault();
      searchInputRef.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [filterRepo, filterType, statusFilter, authorsKey, page]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  useEffect(() => {
    if (loading || initialLoad) return;
    if (page > 0 && page >= totalPages) updateParams({ page: "1" });
  }, [loading, initialLoad, page, totalPages, updateParams]);

  const visibleReviews = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const searched = needle
      ? reviews.filter((review) => {
          const haystack = [
            review.repository_name || review.repository_id,
            review.commit_hash ?? "",
            review.ai_overview ?? "",
            review.commit_author ?? "",
          ]
            .join(" ")
            .toLowerCase();
          return haystack.includes(needle);
        })
      : reviews;
    const sorted = [...searched].sort((a, b) => {
      const cmp =
        sortKey === "repository"
          ? repoName(a).localeCompare(repoName(b))
          : new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted.filter((review) => !removedIds.has(review.id));
  }, [reviews, query, sortKey, sortDir, removedIds]);

  const effectiveSelectedIds = useMemo(
    () => new Set(visibleReviews.filter((review) => selectedIds.has(review.id)).map((review) => review.id)),
    [visibleReviews, selectedIds]
  );
  const selectedCount = effectiveSelectedIds.size;
  const allSelected = visibleReviews.length > 0 && effectiveSelectedIds.size === visibleReviews.length;
  const someSelected = effectiveSelectedIds.size > 0 && !allSelected;

  const toggleSelected = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleAuthor = (author: string) => {
    const next = filterAuthors.includes(author)
      ? filterAuthors.filter((item) => item !== author)
      : [...filterAuthors, author];
    updateParams({ authors: next.length > 0 ? next.join(",") : null });
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      updateParams({ dir: sortDir === "asc" ? "desc" : "asc" });
    } else {
      updateParams({ sort: key, dir: key === "repository" ? "asc" : "desc" });
    }
  };

  const clearFilters = () => {
    updateParams({ repo: null, type: null, authors: null, status: null, q: null });
  };

  const handleRefresh = () => {
    dispatch(fetchReviews(fetchArgs()));
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    setDeleting(true);
    setRemovedIds((prev) => new Set(prev).add(target.id));
    try {
      await api.del(`/api/reviews/${target.id}`);
      await dispatch(fetchReviews(fetchArgs()));
      setRemovedIds((prev) => {
        const next = new Set(prev);
        next.delete(target.id);
        return next;
      });
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(target.id);
        return next;
      });
      toast({
        title: "Review deleted",
        variant: "success",
        action: <ToastAction altText="Dismiss">Dismiss</ToastAction>,
      });
    } catch (err) {
      setRemovedIds((prev) => {
        const next = new Set(prev);
        next.delete(target.id);
        return next;
      });
      toast({
        title: "Delete failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(effectiveSelectedIds);
    if (ids.length === 0) return;
    setBulkConfirmOpen(false);
    setDeleting(true);
    setRemovedIds((prev) => new Set([...prev, ...ids]));
    let failed = 0;
    for (const id of ids) {
      try {
        await api.del(`/api/reviews/${id}`);
      } catch {
        failed += 1;
      }
    }
    await dispatch(fetchReviews(fetchArgs()));
    setRemovedIds(new Set());
    setSelectedIds(new Set());
    setDeleting(false);
    if (failed === 0) {
      toast({
        title: `${ids.length} review${ids.length !== 1 ? "s" : ""} deleted`,
        variant: "success",
        action: <ToastAction altText="Dismiss">Dismiss</ToastAction>,
      });
    } else {
      toast({
        title: `Failed to delete ${failed} review${failed !== 1 ? "s" : ""}`,
        description: "The list was refreshed to reflect the latest state.",
        variant: "destructive",
      });
    }
  };

  const authorFilterLabel =
    filterAuthors.length === 0
      ? "All Authors"
      : filterAuthors.length === 1
        ? filterAuthors[0]
        : `${filterAuthors.length} Authors`;

  const stats = { total, ...statusCounts };

  const statCards: Array<{
    label: string;
    value: number;
    icon: typeof BarChart3;
    tone: StatCardTone;
    status: string;
  }> = [
    { label: "Total Reviews", value: stats.total, icon: BarChart3, tone: "default", status: "all" },
    { label: "Pending", value: stats.pending, icon: Clock, tone: "warning", status: "pending" },
    { label: "Completed", value: stats.completed, icon: CheckCircle2, tone: "positive", status: "completed" },
    { label: "Failed", value: stats.failed, icon: XCircle, tone: "critical", status: "failed" },
  ];

  const statVariants = useReducedMotionVariants(fadeInUp);
  const listVariants = useReducedMotionVariants(staggerContainer);
  const rowVariants = useReducedMotionVariants(fadeIn);
  const cardVariants = useReducedMotionVariants(fadeInUp);

  const listKey = `${page}|${filterRepo}|${filterType}|${statusFilter}|${authorsKey}|${sortKey}|${sortDir}|${query}`;

  const sortIcon = (key: SortKey) => {
    if (sortKey !== key) {
      return <ArrowUpDown className="h-3 w-3 opacity-0 transition-opacity group-hover/sort:opacity-60" aria-hidden="true" />;
    }
    return sortDir === "asc" ? (
      <ArrowUp className="h-3 w-3 text-interactive" aria-hidden="true" />
    ) : (
      <ArrowDown className="h-3 w-3 text-interactive" aria-hidden="true" />
    );
  };

  const sortAria = (key: SortKey): "ascending" | "descending" | "none" =>
    sortKey === key ? (sortDir === "asc" ? "ascending" : "descending") : "none";

  const rowSeverityBorder = (review: Review): string => {
    if (review.status === "completed") {
      const must = review.must_fix_count ?? 0;
      const should = review.should_fix_count ?? 0;
      if (must > 0) return "border-l-2 border-l-destructive";
      if (should > 0) return "border-l-2 border-l-warning";
      return "border-l-2 border-l-success";
    }
    if (review.status === "failed" || review.status === "cancelled") return "border-l-2 border-l-destructive";
    if (review.status === "pending") return "border-l-2 border-l-warning";
    return "";
  };

  const showEmptyNoData = reviews.length === 0 && !hasActiveFilters;
  const showEmptyFiltered = visibleReviews.length === 0 && !showEmptyNoData;
  const showError = reviews.length === 0 && reviewsError !== null;

  const pageWindow = Array.from({ length: totalPages }, (_, i) => i).slice(
    Math.max(0, Math.min(page - 2, totalPages - 5)),
    Math.min(totalPages, Math.max(page + 3, 5))
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Review activity across your repositories, from the latest runs to long-term health."
        actions={
          <>
            <Button
              variant="outline"
              size="icon"
              onClick={handleRefresh}
              disabled={loading || initialLoad}
              aria-label="Refresh reviews"
            >
              <RotateCw className={cn(loading && !initialLoad && "animate-spin")} />
            </Button>
            <Button asChild className="font-semibold shadow-sm">
              <Link to="/reviews/manual">New Review</Link>
            </Button>
          </>
        }
      />

      <motion.div
        variants={listVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-2 gap-4 lg:grid-cols-4"
      >
        {statCards.map((stat) => (
            <motion.div key={stat.label} variants={statVariants}>
              <StatCard
                label={stat.label}
                value={stat.value}
                tone={stat.tone}
                icon={<stat.icon />}
                aria-pressed={statusFilter === stat.status}
                className={cn(
                  "h-full",
                  statusFilter === stat.status && "ring-1 ring-interactive/40 [&>div>p]:text-interactive"
                )}
                onClick={() => updateParams({ status: statusFilter === stat.status ? null : stat.status })}
              />
            </motion.div>
          ))}
      </motion.div>

      <div className="flex flex-wrap items-center gap-2.5 rounded-lg bg-secondary/50 px-3 py-2">
        <Select value={filterRepo} onValueChange={(value) => updateParams({ repo: value })}>
          <SelectTrigger className="h-9 w-44 border-border bg-card text-sm sm:w-52">
            <SelectValue placeholder="All Repositories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Repositories</SelectItem>
            {repos.map((repo) => (
              <SelectItem key={repo.id} value={repo.id}>
                {repo.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterType} onValueChange={(value) => updateParams({ type: value })}>
          <SelectTrigger className="h-9 w-36 border-border bg-card text-sm">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="pr">Pull Request</SelectItem>
            <SelectItem value="manual">Commit</SelectItem>
          </SelectContent>
        </Select>

        <div className="relative" ref={authorDropdownRef}>
          <Button
            type="button"
            variant="outline"
            className="h-9 w-44 justify-between border-border bg-card px-3 text-sm font-normal sm:w-48"
            onClick={() => {
              setAuthorDropdownOpen((open) => !open);
              setAuthorSearch("");
            }}
            aria-haspopup="listbox"
            aria-expanded={authorDropdownOpen}
          >
            <span className="flex min-w-0 items-center gap-2">
              <User className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
              <span className="truncate">{authorFilterLabel}</span>
            </span>
            <ChevronDown
              className={cn("h-4 w-4 flex-shrink-0 opacity-50 transition-transform", authorDropdownOpen && "rotate-180")}
            />
          </Button>
          {authorDropdownOpen && (
            <div
              className="absolute left-0 top-full z-50 mt-1 w-64 rounded-lg border border-border bg-popover text-popover-foreground shadow-lg"
              role="listbox"
              aria-label="Filter by author"
            >
              {authorOptions.length > 0 && (
                <div className="px-2 pt-2 pb-1">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Search authors..."
                      value={authorSearch}
                      onChange={(e) => setAuthorSearch(e.target.value)}
                      className="h-8 w-full rounded-md border border-border bg-background pl-7 pr-2 text-xs outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring"
                    />
                  </div>
                </div>
              )}
              {(() => {
                const filtered = authorSearch
                  ? authorOptions.filter((a) => a.toLowerCase().includes(authorSearch.toLowerCase()))
                  : authorOptions;
                const allFilteredSelected = filtered.length > 0 && filtered.every((a) => filterAuthors.includes(a));
                const someFilteredSelected = filtered.some((a) => filterAuthors.includes(a)) && !allFilteredSelected;

                if (authorOptions.length === 0) {
                  return <div className="px-3 py-2 text-xs text-muted-foreground">No authors found</div>;
                }

                return (
                  <>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs font-medium text-muted-foreground hover:bg-accent"
                      onClick={() => {
                        if (allFilteredSelected) {
                          const next = filterAuthors.filter((a) => !filtered.includes(a));
                          updateParams({ authors: next.length > 0 ? next.join(",") : null });
                        } else {
                          const merged = [...new Set([...filterAuthors, ...filtered])];
                          updateParams({ authors: merged.join(",") });
                        }
                      }}
                    >
                      <span
                        className={cn(
                          "flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-[3px] border transition-colors",
                          allFilteredSelected
                            ? "border-primary bg-primary text-primary-foreground"
                            : someFilteredSelected
                              ? "border-primary bg-primary/10"
                              : "border-muted-foreground/40"
                        )}
                      >
                        {allFilteredSelected && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                        {someFilteredSelected && !allFilteredSelected && <Minus className="h-2.5 w-2.5" />}
                      </span>
                      <span>{allFilteredSelected ? "Clear all" : "Select all"}</span>
                      <span className="ml-auto tabular-nums">
                        {filterAuthors.length > 0
                          ? `${filterAuthors.filter((a) => filtered.includes(a)).length}/${filtered.length}`
                          : `${filtered.length}`}
                      </span>
                    </button>
                    <div className="mx-2 border-t border-border" />
                    <div className="max-h-56 overflow-y-auto py-0.5">
                      {filtered.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-muted-foreground">No matches</div>
                      ) : (
                        filtered.map((author) => {
                          const selected = filterAuthors.includes(author);
                          return (
                            <button
                              key={author}
                              type="button"
                              role="option"
                              aria-selected={selected}
                              className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm outline-none hover:bg-accent focus:bg-accent"
                              onClick={() => toggleAuthor(author)}
                            >
                              <span
                                className={cn(
                                  "flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-[3px] border transition-colors",
                                  selected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"
                                )}
                              >
                                {selected && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                              </span>
                              <span className="truncate text-sm">{author}</span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </div>

        <div className="relative min-w-0 flex-1 sm:max-w-64">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={searchInputRef}
            type="search"
            value={query}
            onChange={(e) => updateParams({ q: e.target.value })}
            placeholder="Search this page..."
            aria-label="Search reviews"
            className="h-9 w-full rounded-lg border border-border bg-card pl-8 pr-14 text-sm outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring [&::-webkit-search-cancel-button]:hidden"
          />
          {query !== "" ? (
            <button
              type="button"
              onClick={() => updateParams({ q: null })}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : (
            <span className="absolute right-2 top-1/2 hidden -translate-y-1/2 sm:inline-flex" aria-hidden="true">
              <Kbd>/</Kbd>
            </span>
          )}
        </div>

        {statusFilter !== "all" && (
          <button
            type="button"
            onClick={() => updateParams({ status: null })}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent"
          >
            Status: {statusFilter === "pending" ? "Pending" : statusFilter === "completed" ? "Completed" : "Failed"}
            <X className="h-3 w-3 text-muted-foreground" />
          </button>
        )}

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="px-2 text-xs font-medium text-interactive underline-offset-4 hover:text-interactive hover:underline"
            onClick={clearFilters}
          >
            Clear filters
          </Button>
        )}
      </div>

      {initialLoad ? (
        <>
          <CardsSkeleton count={4} className="md:hidden" />
          <TableSkeleton rows={6} columns={6} className="hidden md:block" />
        </>
      ) : (
        <Card className="border-border bg-card">
          <CardHeader className="border-b border-border pb-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <CardTitle className="text-sm font-semibold uppercase tracking-tight text-muted-foreground">
                  Recent Reviews
                </CardTitle>
                {selectedCount > 0 ? (
                  <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-primary-foreground">
                    {selectedCount} selected
                  </span>
                ) : (
                  total > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {total} result{total !== 1 ? "s" : ""}
                    </span>
                  )
                )}
              </div>
              {selectedCount > 0 && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedIds(new Set())}
                    disabled={deleting}
                  >
                    Clear selection
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => setBulkConfirmOpen(true)} disabled={deleting}>
                    <Trash2 />
                    Delete selected
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="relative p-0">
            {showError ? (
              <ErrorState
                message={reviewsError ?? "Failed to fetch reviews"}
                onRetry={handleRefresh}
              />
            ) : showEmptyNoData ? (
              <EmptyState
                icon={<FileSearch />}
                title="No reviews yet"
                description="Run your first AI review to start tracking findings across your repositories."
                action={
                  <Button asChild size="sm" className="font-semibold shadow-sm">
                    <Link to="/reviews/manual">Run your first review</Link>
                  </Button>
                }
              />
            ) : showEmptyFiltered ? (
              <EmptyState
                icon={<SearchX />}
                title="No reviews match your filters"
                description="Try different keywords, or reset the filters to see all reviews."
                action={
                  <Button variant="outline" size="sm" onClick={clearFilters}>
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <>
                <div className="hidden overflow-x-auto md:block">
                  <Table className="min-w-[900px]">
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        {isAdmin && (
                          <TableHead className="w-10 pr-0">
                            <SelectAllCheckbox
                              checked={allSelected}
                              indeterminate={someSelected}
                              disabled={visibleReviews.length === 0}
                              onChange={(checked) =>
                                setSelectedIds(checked ? new Set(visibleReviews.map((r) => r.id)) : new Set())
                              }
                            />
                          </TableHead>
                        )}
                        <TableHead className="w-40">Status</TableHead>
                        <TableHead className="w-40" aria-sort={sortAria("repository")}>
                          <button
                            type="button"
                            onClick={() => toggleSort("repository")}
                            className={cn(
                              "group/sort inline-flex items-center gap-1 uppercase tracking-wider transition-colors hover:text-foreground",
                              sortKey === "repository" && "text-interactive"
                            )}
                          >
                            Repository
                            {sortIcon("repository")}
                          </button>
                        </TableHead>
                        <TableHead className="w-20">Type</TableHead>
                        <TableHead className="w-32">Commit</TableHead>
                        <TableHead className="w-40">Author</TableHead>
                        <TableHead className="w-40" aria-sort={sortAria("created")}>
                          <button
                            type="button"
                            onClick={() => toggleSort("created")}
                            className={cn(
                              "group/sort inline-flex items-center gap-1 uppercase tracking-wider transition-colors hover:text-foreground",
                              sortKey === "created" && "text-interactive"
                            )}
                          >
                            Created
                            {sortIcon("created")}
                          </button>
                        </TableHead>
                        <TableHead className="w-20" />
                      </TableRow>
                    </TableHeader>
                    <motion.tbody
                      key={listKey}
                      variants={listVariants}
                      initial="hidden"
                      animate="visible"
                      className="[&_tr:last-child]:border-0"
                    >
                      {visibleReviews.map((review) => {
                        const isSelected = effectiveSelectedIds.has(review.id);
                        const must = review.must_fix_count ?? 0;
                        const should = review.should_fix_count ?? 0;
                        const failLabel = failureLabel(review);
                        return (
                          <motion.tr
                            key={review.id}
                            variants={rowVariants}
                            data-state={isSelected ? "selected" : undefined}
                            className={cn(
                              "group cursor-pointer border-b border-border transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                              rowSeverityBorder(review),
                              isSelected && "bg-muted"
                            )}
                            role="button"
                            tabIndex={0}
                            onClick={() => navigate(`/reviews/${review.id}`)}
                            onKeyDown={(e) => {
                              if ((e.target as HTMLElement).closest("button, input, a")) return;
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                navigate(`/reviews/${review.id}`);
                              }
                            }}
                          >
                            {isAdmin && (
                              <TableCell className="w-10 pr-0">
                                <input
                                  type="checkbox"
                                  className={checkboxInputClass}
                                  checked={isSelected}
                                  onChange={(e) => toggleSelected(review.id, e.target.checked)}
                                  onClick={(e) => e.stopPropagation()}
                                  aria-label={`Select review ${repoName(review)} ${identifierText(review)}`}
                                />
                              </TableCell>
                            )}
                            <TableCell className="w-40 py-2">
                              <div className="flex items-center gap-1.5">
                                <StatusBadge status={review.status} title={failLabel ?? undefined} />
                                {review.status === "completed" && must + should > 0 && (
                                  <SeverityBadge
                                    level={must > 0 ? "must_fix" : "should_fix_soon"}
                                    className="hidden lg:inline-flex"
                                  />
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="max-w-56 py-2">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-medium text-foreground">{repoName(review)}</div>
                                {review.ai_overview && (
                                  <div className="truncate text-xs text-muted-foreground" title={review.ai_overview}>
                                    {review.ai_overview}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="py-2">
                              <TypeMark review={review} />
                            </TableCell>
                            <TableCell className="py-2">
                              <div className="flex items-center gap-0.5">
                                <span
                                  className="max-w-24 truncate font-mono text-xs text-muted-foreground"
                                  title={review.commit_hash}
                                >
                                  {identifierText(review)}
                                </span>
                                <CopyButton
                                  value={review.commit_hash}
                                  label={`Copy commit hash for ${repoName(review)}`}
                                  toastLabel={`Copied ${identifierText(review)}`}
                                  className="h-6 w-6 [&_svg]:h-3 [&_svg]:w-3"
                                />
                              </div>
                            </TableCell>
                            <TableCell className="w-40 py-2">
                              {review.commit_author ? (
                                <div className="flex min-w-0 items-center gap-2">
                                  <AuthorAvatar author={review.commit_author} />
                                  <span className="truncate text-xs text-muted-foreground" title={review.commit_author}>
                                    {review.commit_author}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground/60">&mdash;</span>
                              )}
                            </TableCell>
                            <TableCell className="w-40 py-2 whitespace-nowrap text-xs text-muted-foreground">
                              <div title={formatRelativeTime(review.created_at)}>{formatDateTime(review.created_at)}</div>
                              {review.completed_at && (
                                <div className="text-muted-foreground/70">
                                  {Math.max(
                                    0,
                                    Math.round(
                                      (new Date(review.completed_at).getTime() - new Date(review.created_at).getTime()) /
                                        1000
                                    )
                                  )}
                                  s
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="w-20 py-2 pr-3 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-0.5">
                                {isAdmin && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDeleteTarget(review);
                                    }}
                                    aria-label={`Delete review for ${repoName(review)}`}
                                    className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-opacity transition-colors hover:bg-destructive/10 hover:text-destructive focus:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                )}
                                <ChevronRight
                                  className="h-4 w-4 text-muted-foreground/50 opacity-0 transition-opacity group-hover:opacity-100"
                                  aria-hidden="true"
                                />
                              </div>
                            </TableCell>
                          </motion.tr>
                        );
                      })}
                    </motion.tbody>
                  </Table>
                </div>

                <motion.div
                  key={`cards-${listKey}`}
                  variants={listVariants}
                  initial="hidden"
                  animate="visible"
                  className="space-y-3 p-4 md:hidden"
                >
                  {visibleReviews.map((review) => (
                    <motion.div
                      key={review.id}
                      variants={cardVariants}
                      role="button"
                      tabIndex={0}
                      onClick={() => navigate(`/reviews/${review.id}`)}
                      onKeyDown={(e) => {
                        if ((e.target as HTMLElement).closest("button, input, a")) return;
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          navigate(`/reviews/${review.id}`);
                        }
                      }}
                      className={cn(
                        "rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                        rowSeverityBorder(review)
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-foreground">{repoName(review)}</div>
                          <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <TypeMark review={review} />
                            <span className="font-mono" title={review.commit_hash}>
                              {identifierText(review)}
                            </span>
                            <span aria-hidden="true">&middot;</span>
                            <span title={formatDateTime(review.created_at)}>{formatRelativeTime(review.created_at)}</span>
                          </div>
                        </div>
                        <StatusBadge status={review.status} />
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          {review.commit_author && (
                            <>
                              <AuthorAvatar author={review.commit_author} />
                              <span className="truncate text-xs text-muted-foreground" title={review.commit_author}>
                                {review.commit_author}
                              </span>
                            </>
                          )}
                          <SeverityDots review={review} />
                        </div>
                        <div className="flex items-center gap-1">
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteTarget(review);
                              }}
                              aria-label={`Delete review for ${repoName(review)}`}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <ChevronRight className="h-4 w-4 text-muted-foreground/60" aria-hidden="true" />
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </motion.div>

                {totalPages > 1 && (
                  <div className="flex items-center justify-between border-t border-border px-4 py-3">
                    <span className="text-xs text-muted-foreground">
                      {page * PAGE_SIZE + 1}&ndash;{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-8 p-0"
                        disabled={page === 0}
                        onClick={() => updateParams({ page: String(page) })}
                        aria-label="Previous page"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      {pageWindow.map((i) => (
                        <Button
                          key={i}
                          variant={i === page ? "default" : "outline"}
                          size="sm"
                          className="h-8 w-8 p-0 text-xs"
                          aria-current={i === page ? "page" : undefined}
                          onClick={() => updateParams({ page: String(i + 1) })}
                        >
                          {i + 1}
                        </Button>
                      ))}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-8 p-0"
                        disabled={page >= totalPages - 1}
                        onClick={() => updateParams({ page: String(page + 2) })}
                        aria-label="Next page"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
            {loading && !initialLoad && (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded-b-lg bg-background/60 backdrop-blur-[2px]">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-foreground" />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-4 w-4" />
              Delete Review
            </DialogTitle>
            <DialogDescription className="pt-1">
              Permanently delete the review for{" "}
              <span className="font-medium text-foreground">{deleteTarget ? repoName(deleteTarget) : ""}</span>
              {deleteTarget && (
                <span className="ml-1 font-mono text-xs text-muted-foreground">({identifierText(deleteTarget)})</span>
              )}
              ? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete Review"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkConfirmOpen} onOpenChange={setBulkConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-4 w-4" />
              Delete {selectedCount} Review{selectedCount !== 1 ? "s" : ""}
            </DialogTitle>
            <DialogDescription className="pt-1">
              Permanently delete {selectedCount} review{selectedCount !== 1 ? "s" : ""} and their findings? This cannot
              be undone.
            </DialogDescription>
          </DialogHeader>
          {selectedCount > 0 && (
            <ul className="max-h-36 space-y-1 overflow-y-auto rounded-lg border border-border bg-secondary/40 p-2">
              {visibleReviews
                .filter((review) => effectiveSelectedIds.has(review.id))
                .slice(0, 5)
                .map((review) => (
                  <li key={review.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate text-foreground">{repoName(review)}</span>
                    <span className="shrink-0 font-mono text-muted-foreground">{identifierText(review)}</span>
                  </li>
                ))}
              {selectedCount > 5 && (
                <li className="text-xs text-muted-foreground">and {selectedCount - 5} more...</li>
              )}
            </ul>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setBulkConfirmOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleBulkDelete} disabled={deleting}>
              Delete {selectedCount} Review{selectedCount !== 1 ? "s" : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
