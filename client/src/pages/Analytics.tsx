import { useEffect, useRef, useState } from "react";
import { api } from "@/services/api";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3, TrendingUp, FileWarning, DollarSign } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

type CategoryOverTime = { date: string; category: string; count: string };
type TopFile = { file_path: string; count: string; must_fix_count: string };
type RepoDensity = { repository_name: string; review_count: string; finding_count: string; avg_findings: string };
type CostSummary = { total_reviews: string; total_tokens: string; total_cost: string };

const COLORS = ["hsl(var(--destructive))", "hsl(var(--warning))", "hsl(var(--muted-foreground))", "hsl(220, 70%, 50%)", "hsl(160, 60%, 45%)"];

export default function Analytics() {
  const [overTime, setOverTime] = useState<CategoryOverTime[]>([]);
  const [topFiles, setTopFiles] = useState<TopFile[]>([]);
  const [density, setDensity] = useState<RepoDensity[]>([]);
  const [cost, setCost] = useState<CostSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [chartWidth, setChartWidth] = useState(0);
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [ot, tf, dn, cs] = await Promise.all([
          api.get<CategoryOverTime[]>("/api/analytics/findings-over-time"),
          api.get<TopFile[]>("/api/analytics/top-files"),
          api.get<RepoDensity[]>("/api/analytics/finding-density"),
          api.get<CostSummary[]>("/api/analytics/cost-summary"),
        ]);
        setOverTime(ot);
        setTopFiles(tf.slice(0, 10));
        setDensity(dn);
        setCost(cs[0] || null);
      } catch { /* ignore */ }
      finally { setLoading(false); }
    }
    load();
  }, []);

  useEffect(() => {
    const el = chartRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setChartWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const overTimeAgg = overTime.reduce<Record<string, Record<string, number>>>((acc, cur) => {
    if (!acc[cur.date]) acc[cur.date] = {};
    const dateEntry = acc[cur.date];
    if (dateEntry) dateEntry[cur.category || "other"] = Number(cur.count);
    return acc;
  }, {});
  const overTimeChart = Object.entries(overTimeAgg)
    .map(([date, cats]) => ({ date: date.substring(5), ...cats }))
    .reverse()
    .slice(0, 14);

  const categories = [...new Set(overTime.map((o) => o.category || "other"))];

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold tracking-tight">Analytics</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <h2 className="text-2xl font-bold tracking-tight">Analytics</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-border bg-card">
          <CardContent className="flex items-center gap-3 pt-6 pb-5">
            <TrendingUp className="h-8 w-8 text-muted-foreground" />
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Reviews (30d)</span>
              <span className="block mt-0.5 text-3xl font-bold tabular-nums">{cost?.total_reviews ?? "0"}</span>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="flex items-center gap-3 pt-6 pb-5">
            <FileWarning className="h-8 w-8 text-muted-foreground" />
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Total Findings</span>
              <span className="block mt-0.5 text-3xl font-bold tabular-nums">{cost?.total_tokens ? Math.round(Number(cost.total_tokens) / 1000) : "—"}</span>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="flex items-center gap-3 pt-6 pb-5">
            <DollarSign className="h-8 w-8 text-muted-foreground" />
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Est. Cost (30d)</span>
              <span className="block mt-0.5 text-3xl font-bold tabular-nums">${Number(cost?.total_cost ?? 0).toFixed(4)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-border bg-card">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold text-foreground">Findings Over Time by Category</span>
            </div>
            {overTimeChart.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-xs text-muted-foreground">No data yet</div>
            ) : (
              <div ref={chartRef} style={{ width: "100%", height: 220 }}>
                {chartWidth > 0 && (
                  <BarChart width={chartWidth} height={220} data={overTimeChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
                    {categories.map((cat, i) => (
                      <Bar key={cat} dataKey={cat} stackId="a" fill={COLORS[i % COLORS.length]} />
                    ))}
                  </BarChart>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-4">
              <FileWarning className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold text-foreground">Top Problem Files</span>
            </div>
            {topFiles.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-xs text-muted-foreground">No data yet</div>
            ) : (
              <div className="space-y-2 max-h-52 overflow-y-auto">
                {topFiles.map((f) => (
                  <div key={f.file_path} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-accent transition-colors">
                    <span className="text-xs font-mono text-foreground truncate flex-1">{f.file_path}</span>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground flex-shrink-0">
                      {Number(f.must_fix_count) > 0 && <span className="text-destructive font-medium">{f.must_fix_count} must-fix</span>}
                      <span>{f.count} total</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold text-foreground">Finding Density per Repository</span>
            </div>
            {density.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-xs text-muted-foreground">No data yet</div>
            ) : (
              <div className="space-y-2">
                {density.map((r) => (
                  <div key={r.repository_name} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-accent transition-colors">
                    <span className="text-xs font-semibold text-foreground truncate">{r.repository_name}</span>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-shrink-0">
                      <span>{r.review_count} reviews</span>
                      <span className="font-medium">{r.avg_findings} avg findings</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
