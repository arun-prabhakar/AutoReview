import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "motion/react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "@/services/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CardsSkeleton,
  EmptyState,
  ErrorState,
  PageHeader,
  StatCard,
  TableSkeleton,
} from "@/components/shared";
import { cn } from "@/lib/utils";
import { fadeIn, fadeInUp, staggerContainer, useReducedMotionVariants } from "@/lib/motion";
import { useToast } from "@/hooks/use-toast";
import {
  ChevronRight,
  DollarSign,
  FileSearch,
  ListChecks,
  RotateCw,
  Scale,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react";

// The analytics API (server/src/routes/analytics.ts) returns a fixed 30-day
// window: 7d is filtered/recomputed client-side from row-level data; 90d falls
// back to the available 30-day history, noted in the UI copy.

type RangeDays = 7 | 30 | 90;

const RANGES: Array<{ value: RangeDays; label: string }> = [
  { value: 7, label: "7d" },
  { value: 30, label: "30d" },
  { value: 90, label: "90d" },
];

const API_WINDOW_DAYS = 30;

interface FindingsOverTimeRow {
  date: string;
  category: string | null;
  count: string;
}

interface TopFileRow {
  file_path: string;
  count: string;
  must_fix_count: string;
}

interface CostSummaryResponse {
  total_reviews: string;
  total_tokens: string;
  total_cost: string;
  avg_cost: string;
}

interface ModelCostResponse {
  llm_model: string;
  review_count: string;
  total_tokens: string;
  total_cost: string;
}

interface ReviewCostRow {
  id: string;
  repository_name: string;
  commit_hash: string;
  review_mode: string;
  llm_model: string;
  tokens_total: number;
  estimated_cost: number;
  created_at: string;
}

interface ModelCost {
  model: string;
  cost: number;
  tokens: number;
  reviews: number;
}

interface Totals {
  reviews: number;
  tokens: number;
  cost: number;
  avgCost: number;
}

function formatCost(n: number): string {
  if (n === 0) return "$0.00";
  if (n < 0.01) return `$${n.toFixed(6)}`;
  if (n < 1) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseDateKey(key: string): Date {
  return new Date(`${key}T00:00:00`);
}

function formatDateKey(key: string): string {
  return parseDateKey(key).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

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

function formatAbsoluteTime(dt: string): string {
  return new Date(dt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function targetLabel(row: Pick<ReviewCostRow, "commit_hash" | "review_mode">): string {
  if (row.review_mode === "pr" || row.commit_hash?.startsWith("pr:")) {
    return `PR #${row.commit_hash.replace("pr:", "").split(":")[0]}`;
  }
  return row.commit_hash.substring(0, 10);
}

const tooltipContentStyle = {
  backgroundColor: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "0.75rem",
  fontSize: "12px",
  color: "hsl(var(--popover-foreground))",
  padding: "8px 12px",
  boxShadow: "0 4px 12px hsl(var(--foreground) / 0.08)",
};

export default function Analytics() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const rangeParam = searchParams.get("range");
  const range: RangeDays = rangeParam === "7" ? 7 : rangeParam === "90" ? 90 : 30;

  const setRange = useCallback(
    (value: RangeDays) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value === 30) next.delete("range");
          else next.set("range", String(value));
          return next;
        },
        { replace: false }
      );
    },
    [setSearchParams]
  );

  const [findingsRows, setFindingsRows] = useState<FindingsOverTimeRow[]>([]);
  const [topFiles, setTopFiles] = useState<TopFileRow[]>([]);
  const [summary, setSummary] = useState<CostSummaryResponse | null>(null);
  const [models, setModels] = useState<ModelCostResponse[]>([]);
  const [reviews, setReviews] = useState<ReviewCostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [fot, tf, cs, cm, cr] = await Promise.all([
        api.get<FindingsOverTimeRow[]>("/api/analytics/findings-over-time"),
        api.get<TopFileRow[]>("/api/analytics/top-files"),
        api.get<CostSummaryResponse>("/api/analytics/cost-summary"),
        api.get<ModelCostResponse[]>("/api/analytics/cost-by-model"),
        api.get<ReviewCostRow[]>("/api/analytics/cost-per-review?limit=100"),
      ]);
      setFindingsRows(fot);
      setTopFiles(tf);
      setSummary(cs);
      setModels(cm);
      setReviews(cr);
      setError(null);
      hasLoadedRef.current = true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Refresh failures keep stale data on screen; surface them as a toast.
  useEffect(() => {
    if (error && hasLoadedRef.current) {
      toast({
        title: "Failed to refresh analytics",
        description: error,
        variant: "destructive",
      });
    }
  }, [error, toast]);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const rangeStart = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() - (range - 1));
    return d;
  }, [range, today]);

  // Beyond the 30-day API window, clamp the series to the earliest available data.
  const seriesStart = useMemo(() => {
    if (range <= API_WINDOW_DAYS) return rangeStart;
    let earliest: Date | null = null;
    for (const row of findingsRows) {
      const d = parseDateKey(row.date);
      if (!earliest || d < earliest) earliest = d;
    }
    return earliest && earliest > rangeStart ? earliest : rangeStart;
  }, [findingsRows, range, rangeStart]);

  const series = useMemo(() => {
    const byDate = new Map<string, number>();
    for (const row of findingsRows) {
      if (parseDateKey(row.date) < rangeStart) continue;
      byDate.set(row.date, (byDate.get(row.date) ?? 0) + Number(row.count));
    }
    const points: Array<{ date: string; count: number }> = [];
    const cursor = new Date(seriesStart);
    while (cursor <= today) {
      const key = dateKey(cursor);
      points.push({ date: key, count: byDate.get(key) ?? 0 });
      cursor.setDate(cursor.getDate() + 1);
    }
    return points;
  }, [findingsRows, rangeStart, seriesStart, today]);

  const totalFindings = useMemo(
    () => series.reduce((sum, point) => sum + point.count, 0),
    [series]
  );

  const allTimeFindings = useMemo(
    () => topFiles.reduce((sum, file) => sum + Number(file.count), 0),
    [topFiles]
  );

  const rangedReviews = useMemo(() => {
    if (range >= API_WINDOW_DAYS) return reviews;
    return reviews.filter((row) => new Date(row.created_at) >= rangeStart);
  }, [range, rangeStart, reviews]);

  const totals: Totals = useMemo(() => {
    if (range >= API_WINDOW_DAYS) {
      return {
        reviews: Number(summary?.total_reviews ?? 0),
        tokens: Number(summary?.total_tokens ?? 0),
        cost: Number(summary?.total_cost ?? 0),
        avgCost: Number(summary?.avg_cost ?? 0),
      };
    }
    const cost = rangedReviews.reduce((sum, row) => sum + Number(row.estimated_cost ?? 0), 0);
    const tokens = rangedReviews.reduce((sum, row) => sum + Number(row.tokens_total ?? 0), 0);
    return {
      reviews: rangedReviews.length,
      tokens,
      cost,
      avgCost: rangedReviews.length > 0 ? cost / rangedReviews.length : 0,
    };
  }, [range, rangedReviews, summary]);

  const modelCosts = useMemo<ModelCost[]>(() => {
    if (range >= API_WINDOW_DAYS) {
      return models
        .map((m) => ({
          model: m.llm_model,
          cost: Number(m.total_cost),
          tokens: Number(m.total_tokens),
          reviews: Number(m.review_count),
        }))
        .sort((a, b) => b.cost - a.cost);
    }
    const byModel = new Map<string, ModelCost>();
    for (const row of rangedReviews) {
      const entry = byModel.get(row.llm_model) ?? { model: row.llm_model, cost: 0, tokens: 0, reviews: 0 };
      entry.cost += Number(row.estimated_cost ?? 0);
      entry.tokens += Number(row.tokens_total ?? 0);
      entry.reviews += 1;
      byModel.set(row.llm_model, entry);
    }
    return [...byModel.values()].sort((a, b) => b.cost - a.cost);
  }, [models, rangedReviews, range]);

  const totalModelCost = useMemo(
    () => modelCosts.reduce((sum, m) => sum + m.cost, 0),
    [modelCosts]
  );

  const avgFindingsPerReview =
    totals.reviews > 0 ? totalFindings / totals.reviews : 0;

  const hasData = summary !== null;
  const isZeroState =
    hasData &&
    reviews.length === 0 &&
    findingsRows.length === 0 &&
    topFiles.length === 0 &&
    Number(summary.total_reviews) === 0;

  const sectionVariants = useReducedMotionVariants(fadeIn);
  const statVariants = useReducedMotionVariants(fadeInUp);
  const listVariants = useReducedMotionVariants(staggerContainer);

  const headerActions = (
    <>
      <div
        role="group"
        aria-label="Date range"
        className="inline-flex items-center gap-0.5 rounded-[10px] border border-border bg-card p-1"
      >
        {RANGES.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={range === option.value}
            onClick={() => setRange(option.value)}
            className={cn(
              "rounded-md px-3 py-1 text-xs font-medium transition-colors duration-fast ease-out-expo",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              range === option.value
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      <Button
        variant="outline"
        size="icon"
        onClick={load}
        disabled={loading}
        aria-label="Refresh analytics"
      >
        <RotateCw className={cn(loading && "animate-spin")} />
      </Button>
    </>
  );

  if (!hasData && loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Analytics"
          description="Cost, usage, and finding trends across completed reviews."
          actions={headerActions}
        />
        <CardsSkeleton count={3} />
        <Skeleton className="h-[380px] w-full rounded-xl" />
        <TableSkeleton rows={6} columns={6} />
      </div>
    );
  }

  if (!hasData && error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Analytics"
          description="Cost, usage, and finding trends across completed reviews."
          actions={headerActions}
        />
        <Card className="border-border bg-card">
          <CardContent className="pt-6">
            <ErrorState message={error} onRetry={load} />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isZeroState) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Analytics"
          description="Cost, usage, and finding trends across completed reviews."
          actions={headerActions}
        />
        <Card className="border-border bg-card">
          <CardContent className="pt-6">
            <EmptyState
              icon={<FileSearch />}
              title="No analytics yet"
              description="Analytics appear once your first review completes. Run a review to start tracking findings, tokens, and cost."
              action={
                <Button asChild size="sm" className="font-semibold shadow-sm">
                  <Link to="/reviews/manual">Run your first review</Link>
                </Button>
              }
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  const statCards = [
    {
      label: "Total Findings",
      value: totalFindings.toLocaleString(),
      icon: <ListChecks />,
      trend: `${allTimeFindings.toLocaleString()} all-time`,
    },
    {
      label: "Total Cost",
      value: formatCost(totals.cost),
      icon: <DollarSign />,
      trend: `${totals.reviews.toLocaleString()} completed ${totals.reviews === 1 ? "review" : "reviews"}`,
    },
    {
      label: "Total Tokens",
      value: formatTokens(totals.tokens),
      icon: <Zap />,
      trend: `${totals.tokens.toLocaleString()} tokens processed`,
    },
    {
      label: "Completed Reviews",
      value: totals.reviews.toLocaleString(),
      icon: <FileSearch />,
      trend: range > API_WINDOW_DAYS ? "Last 30 days" : `Last ${range} days`,
    },
    {
      label: "Avg Cost / Review",
      value: formatCost(totals.avgCost),
      icon: <Scale />,
      trend: `${formatCost(totals.cost)} across ${totals.reviews.toLocaleString()} ${totals.reviews === 1 ? "review" : "reviews"}`,
    },
    {
      label: "Avg Findings / Review",
      value: avgFindingsPerReview.toFixed(1),
      icon: <Target />,
      trend: `${totalFindings.toLocaleString()} findings in period`,
    },
  ];

  const maxModelCost = modelCosts.length > 0 ? Math.max(...modelCosts.map((m) => m.cost)) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description="Cost, usage, and finding trends across completed reviews."
        actions={headerActions}
      />

      {range > API_WINDOW_DAYS && (
        <p className="-mt-2 text-xs text-muted-foreground">
          Analytics history currently covers the last {API_WINDOW_DAYS} days.
        </p>
      )}

      <motion.div
        variants={listVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {statCards.map((stat) => (
          <motion.div key={stat.label} variants={statVariants}>
            <StatCard
              label={stat.label}
              value={stat.value}
              icon={stat.icon}
              trend={stat.trend}
              className="h-full"
            />
          </motion.div>
        ))}
      </motion.div>

      <motion.div variants={sectionVariants} initial="hidden" animate="visible">
        <Card className="border-border bg-card">
          <CardHeader className="border-b border-border pb-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-sm font-semibold uppercase tracking-tight text-muted-foreground">
                Findings Trend
              </CardTitle>
              <span className="text-xs text-muted-foreground">
                {formatDateKey(dateKey(seriesStart))} &ndash; {formatDateKey(dateKey(today))}
              </span>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            {findingsRows.length === 0 ? (
              <EmptyState
                icon={<TrendingUp />}
                title="No findings recorded yet"
                description="Findings appear here as completed reviews flag issues in your code."
              />
            ) : (
              <>
                <div
                  className="h-[280px] w-full"
                  role="img"
                  aria-label={`Line chart of findings per day over the last ${range} days`}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id="findingsFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(var(--interactive))" stopOpacity={0.14} />
                          <stop offset="100%" stopColor="hsl(var(--interactive))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        stroke="hsl(var(--border))"
                        strokeDasharray="3 3"
                        strokeOpacity={0.8}
                      />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(value) => formatDateKey(String(value))}
                        tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                        tickLine={false}
                        axisLine={{ stroke: "hsl(var(--border))" }}
                        minTickGap={28}
                      />
                      <YAxis
                        allowDecimals={false}
                        width={32}
                        tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip
                        formatter={(value) => [Number(value).toLocaleString(), "Findings"]}
                        labelFormatter={(label) => formatDateKey(String(label))}
                        contentStyle={tooltipContentStyle}
                        labelStyle={{ color: "hsl(var(--muted-foreground))", marginBottom: 4 }}
                        itemStyle={{ color: "hsl(var(--foreground))", padding: 0 }}
                        cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }}
                      />
                      <Area
                        type="monotone"
                        dataKey="count"
                        name="Findings"
                        stroke="hsl(var(--interactive))"
                        strokeWidth={2}
                        fill="url(#findingsFill)"
                        dot={false}
                        activeDot={{
                          r: 4,
                          fill: "hsl(var(--interactive))",
                          stroke: "hsl(var(--background))",
                          strokeWidth: 2,
                        }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <table className="sr-only">
                  <caption>{`Findings per day over the last ${range} days`}</caption>
                  <thead>
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col">Findings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {series.map((point) => (
                      <tr key={point.date}>
                        <th scope="row">{point.date}</th>
                        <td>{point.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <motion.div variants={sectionVariants} initial="hidden" animate="visible">
        <Card className="border-border bg-card">
          <CardHeader className="border-b border-border pb-4">
            <CardTitle className="text-sm font-semibold uppercase tracking-tight text-muted-foreground">
              Cost by Model
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            {modelCosts.length === 0 ? (
              <EmptyState
                icon={<DollarSign />}
                title="No spend recorded in this period"
                description="Model costs appear here once reviews complete with token usage."
              />
            ) : (
              <div className="space-y-4">
                {modelCosts.map((m, index) => {
                  const share =
                    totalModelCost > 0 ? (m.cost / totalModelCost) * 100 : 0;
                  const width = maxModelCost > 0 ? (m.cost / maxModelCost) * 100 : 0;
                  return (
                    <div key={m.model} className="space-y-1.5">
                      <div className="flex items-baseline justify-between gap-3">
                        <span
                          className="truncate font-mono text-xs font-semibold text-foreground"
                          title={m.model}
                        >
                          {m.model}
                        </span>
                        <span className="flex shrink-0 items-baseline gap-3 text-xs">
                          <span className="text-muted-foreground">
                            {share.toFixed(0)}% of spend
                          </span>
                          <span className="font-semibold tabular-nums text-foreground">
                            {formatCost(m.cost)}
                          </span>
                        </span>
                      </div>
                      <div
                        className="h-1.5 overflow-hidden rounded-full bg-secondary"
                        role="img"
                        aria-label={`${m.model}: ${formatCost(m.cost)}, ${share.toFixed(0)} percent of total spend`}
                      >
                        <div
                          className={cn(
                            "h-full rounded-full transition-[width] duration-slow ease-out-expo",
                            index === 0 ? "bg-interactive" : "bg-foreground/70"
                          )}
                          style={{ width: `${width}%` }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {m.reviews.toLocaleString()} {m.reviews === 1 ? "review" : "reviews"} ·{" "}
                        {formatTokens(m.tokens)} tokens
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <motion.div variants={sectionVariants} initial="hidden" animate="visible">
        <Card className="border-border bg-card">
          <CardHeader className="border-b border-border pb-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-sm font-semibold uppercase tracking-tight text-muted-foreground">
                Recent Review Costs
              </CardTitle>
              <span className="text-xs text-muted-foreground">
                Select a row to open the review
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {rangedReviews.length === 0 ? (
              <EmptyState
                icon={<DollarSign />}
                title="No completed reviews in this period"
                description="Try a wider date range, or run a new review to see costs here."
              />
            ) : (
              <div className="max-h-[520px] overflow-y-auto custom-scroll">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="sticky top-0 z-10 bg-card px-4 py-2.5 text-left font-medium uppercase tracking-wider text-muted-foreground">
                      Repository
                      </th>
                      <th className="sticky top-0 z-10 bg-card px-4 py-2.5 text-left font-medium uppercase tracking-wider text-muted-foreground">
                      Target
                      </th>
                      <th className="sticky top-0 z-10 bg-card px-4 py-2.5 text-left font-medium uppercase tracking-wider text-muted-foreground">
                      Model
                      </th>
                      <th className="sticky top-0 z-10 bg-card px-4 py-2.5 text-right font-medium uppercase tracking-wider text-muted-foreground">
                      Tokens
                      </th>
                      <th className="sticky top-0 z-10 bg-card px-4 py-2.5 text-right font-medium uppercase tracking-wider text-muted-foreground">
                      Cost
                      </th>
                      <th className="sticky top-0 z-10 bg-card px-4 py-2.5 text-right font-medium uppercase tracking-wider text-muted-foreground">
                      When
                      </th>
                      <th className="sticky top-0 z-10 bg-card px-4 py-2.5" aria-hidden="true" />
                    </tr>
                  </thead>
                  <tbody>
                    {rangedReviews.map((row) => (
                      <tr
                        key={row.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => navigate(`/reviews/${row.id}`)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            navigate(`/reviews/${row.id}`);
                          }
                        }}
                        className="group cursor-pointer border-b border-border/60 transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                      >
                        <td className="max-w-44 truncate px-4 py-2.5 font-medium text-foreground">
                          {row.repository_name}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-muted-foreground">
                          {targetLabel(row)}
                        </td>
                        <td className="max-w-36 truncate px-4 py-2.5 font-mono text-muted-foreground" title={row.llm_model}>
                          {row.llm_model}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                          {Number(row.tokens_total ?? 0).toLocaleString()}
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-foreground">
                          {formatCost(Number(row.estimated_cost ?? 0))}
                        </td>
                        <td
                          className="whitespace-nowrap px-4 py-2.5 text-right text-muted-foreground"
                          title={formatAbsoluteTime(row.created_at)}
                        >
                          {formatRelativeTime(row.created_at)}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <ChevronRight
                            className="ml-auto h-4 w-4 text-muted-foreground/50 opacity-0 transition-opacity group-hover:opacity-100"
                            aria-hidden="true"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
