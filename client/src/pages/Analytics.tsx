import { useEffect, useState } from "react";
import { api } from "@/services/api";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { BarChart3, TrendingUp, FileWarning, DollarSign, PieChart, Clock, AlertTriangle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart as RPieChart, Pie, Cell, Legend } from "recharts";

type CategoryOverTime = { date: string; category: string; count: string };
type TopFile = { file_path: string; count: string; must_fix_count: string };
type RepoDensity = { repository_name: string; review_count: string; finding_count: string; avg_findings: string };
type DispositionStat = { disposition: string; count: string };
type CostSummary = { total_reviews: string; total_tokens: string; total_cost: string };
type SlaStat = { severity: string; total: string; breached: string; avg_hours: string };
type SlaBreach = { finding_id: string; repository_name: string; file_path: string; summary: string; risk_level: string; hours_open: string; review_id: string };

const COLORS = ["hsl(var(--destructive))", "hsl(var(--warning))", "hsl(var(--muted-foreground))", "hsl(220, 70%, 50%)", "hsl(160, 60%, 45%)"];

export default function Analytics() {
  const [overTime, setOverTime] = useState<CategoryOverTime[]>([]);
  const [topFiles, setTopFiles] = useState<TopFile[]>([]);
  const [density, setDensity] = useState<RepoDensity[]>([]);
  const [dispositions, setDispositions] = useState<DispositionStat[]>([]);
  const [cost, setCost] = useState<CostSummary | null>(null);
  const [slaStats, setSlaStats] = useState<SlaStat[]>([]);
  const [slaBreaches, setSlaBreaches] = useState<SlaBreach[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [ot, tf, dn, ds, cs, ss, sb] = await Promise.all([
          api.get<CategoryOverTime[]>("/api/analytics/findings-over-time"),
          api.get<TopFile[]>("/api/analytics/top-files"),
          api.get<RepoDensity[]>("/api/analytics/finding-density"),
          api.get<DispositionStat[]>("/api/analytics/disposition-stats"),
          api.get<CostSummary[]>("/api/analytics/cost-summary"),
          api.get<SlaStat[]>("/api/analytics/sla-stats"),
          api.get<SlaBreach[]>("/api/analytics/sla-breached"),
        ]);
        setOverTime(ot);
        setTopFiles(tf.slice(0, 10));
        setDensity(dn);
        setDispositions(ds);
        setCost(cs[0] || null);
        setSlaStats(ss);
        setSlaBreaches(sb);
      } catch { /* ignore */ }
      finally { setLoading(false); }
    }
    load();
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

  const totalFindings = dispositions.reduce((sum, d) => sum + Number(d.count), 0);
  const dispositionChart = dispositions.map((d) => ({
    name: d.disposition,
    value: Number(d.count),
    percent: totalFindings > 0 ? Math.round((Number(d.count) / totalFindings) * 100) : 0,
  })).filter((d) => d.value > 0);

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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-border bg-card">
          <CardContent className="flex items-center gap-3 pt-6 pb-5">
            <BarChart3 className="h-8 w-8 text-muted-foreground" />
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Total Findings</span>
              <span className="block mt-0.5 text-3xl font-bold tabular-nums">{totalFindings}</span>
            </div>
          </CardContent>
        </Card>
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
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Open Findings</span>
              <span className="block mt-0.5 text-3xl font-bold tabular-nums">
                {dispositions.find((d) => d.disposition === "open")?.count ?? "0"}
              </span>
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
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={overTimeChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
                  {categories.map((cat, i) => (
                    <Bar key={cat} dataKey={cat} stackId="a" fill={COLORS[i % COLORS.length]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-4">
              <PieChart className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold text-foreground">Finding Dispositions</span>
            </div>
            {dispositionChart.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-xs text-muted-foreground">No data yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <RPieChart>
                  <Pie data={dispositionChart} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }) => `${name} ${percent}%`}>
                    {dispositionChart.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
                  <Legend wrapperStyle={{ fontSize: "11px" }} />
                </RPieChart>
              </ResponsiveContainer>
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

      {(slaStats.length > 0 || slaBreaches.length > 0) && (
        <Card className="border-border bg-card">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold text-foreground">SLA Compliance</span>
              {slaBreaches.length > 0 && (
                <span className="ml-auto text-xs font-semibold text-destructive flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />{slaBreaches.length} breached
                </span>
              )}
            </div>
            {slaStats.length === 0 ? (
              <div className="h-32 flex items-center justify-center text-xs text-muted-foreground">No SLA data yet</div>
            ) : (
              <div className="space-y-3">
                {slaStats.map((s) => {
                  const total = Number(s.total);
                  const breached = Number(s.breached);
                  const compliance = total > 0 ? Math.round(((total - breached) / total) * 100) : 100;
                  const label = s.severity === "must_fix" ? "Must Fix (48h SLA)" : "Should Fix (168h SLA)";
                  return (
                    <div key={s.severity} className="flex items-center gap-4">
                      <span className="text-xs font-medium text-foreground w-36 flex-shrink-0">{label}</span>
                      <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                        <div className={cn("h-full rounded-full", compliance >= 90 ? "bg-emerald-400" : compliance >= 70 ? "bg-amber-400" : "bg-red-400")} style={{ width: `${compliance}%` }} />
                      </div>
                      <span className={cn("text-xs font-bold tabular-nums w-16 text-right", compliance >= 90 ? "text-emerald-400" : compliance >= 70 ? "text-amber-400" : "text-red-400")}>
                        {compliance}%
                      </span>
                      <span className="text-[10px] text-muted-foreground w-20 text-right">avg {Math.round(Number(s.avg_hours))}h</span>
                    </div>
                  );
                })}
              </div>
            )}
            {slaBreaches.length > 0 && (
              <div className="mt-4 pt-3 border-t border-border">
                <span className="text-xs font-semibold text-muted-foreground">Breached Findings</span>
                <div className="mt-2 space-y-1.5 max-h-32 overflow-y-auto">
                  {slaBreaches.slice(0, 5).map((b) => (
                    <div key={b.finding_id} className="flex items-center gap-2 text-xs">
                      <span className={cn("font-mono truncate flex-1", b.risk_level === "must_fix" ? "text-destructive" : "text-amber-400")}>{b.summary}</span>
                      <span className="text-muted-foreground flex-shrink-0">{Math.round(Number(b.hours_open))}h open</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
