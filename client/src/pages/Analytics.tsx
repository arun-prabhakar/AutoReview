import { useEffect, useState } from "react";
import { api } from "@/services/api";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, Cpu, Zap, FileSearch } from "lucide-react";

type CostSummary = { total_reviews: string; total_tokens: string; total_cost: string; avg_cost: string };
type ModelCost = { llm_model: string; review_count: string; total_tokens: string; total_cost: string };
type ReviewCost = { id: string; repository_name: string; llm_model: string; tokens_total: number; estimated_cost: number; created_at: string };

export default function Analytics() {
  const [summary, setSummary] = useState<CostSummary | null>(null);
  const [models, setModels] = useState<ModelCost[]>([]);
  const [reviews, setReviews] = useState<ReviewCost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [cs, mc, cr] = await Promise.all([
          api.get<CostSummary>("/api/analytics/cost-summary"),
          api.get<ModelCost[]>("/api/analytics/cost-by-model"),
          api.get<ReviewCost[]>("/api/analytics/cost-per-review?limit=50"),
        ]);
        setSummary(cs);
        setModels(mc);
        setReviews(cr);
      } catch { /* ignore */ }
      finally { setLoading(false); }
    }
    load();
  }, []);

  const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n.toFixed(0);
  const fmtCost = (n: number) => n < 0.01 && n > 0 ? `$${n.toFixed(6)}` : `$${n.toFixed(4)}`;

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold tracking-tight">Cost Analytics</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <h2 className="text-2xl font-bold tracking-tight">Cost Analytics</h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-border bg-card">
          <CardContent className="flex items-center gap-3 pt-6 pb-5">
            <DollarSign className="h-8 w-8 text-muted-foreground" />
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Total Cost (30d)</span>
              <span className="block mt-0.5 text-3xl font-bold tabular-nums">{fmtCost(Number(summary?.total_cost ?? 0))}</span>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="flex items-center gap-3 pt-6 pb-5">
            <Zap className="h-8 w-8 text-muted-foreground" />
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Total Tokens</span>
              <span className="block mt-0.5 text-3xl font-bold tabular-nums">{fmt(Number(summary?.total_tokens ?? 0))}</span>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="flex items-center gap-3 pt-6 pb-5">
            <FileSearch className="h-8 w-8 text-muted-foreground" />
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Reviews</span>
              <span className="block mt-0.5 text-3xl font-bold tabular-nums">{summary?.total_reviews ?? "0"}</span>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="flex items-center gap-3 pt-6 pb-5">
            <Cpu className="h-8 w-8 text-muted-foreground" />
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Avg Cost/Review</span>
              <span className="block mt-0.5 text-3xl font-bold tabular-nums">{fmtCost(Number(summary?.avg_cost ?? 0))}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {models.length > 0 && (
        <Card className="border-border bg-card">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-4">
              <Cpu className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold text-foreground">Cost by Model</span>
            </div>
            <div className="space-y-3">
              {models.map((m) => {
                const maxCost = Math.max(...models.map((x) => Number(x.total_cost)), 0.001);
                const pct = (Number(m.total_cost) / maxCost) * 100;
                return (
                  <div key={m.llm_model} className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-mono font-semibold text-foreground">{m.llm_model}</span>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-shrink-0">
                        <span>{m.review_count} reviews</span>
                        <span>{fmt(Number(m.total_tokens))} tokens</span>
                        <span className="font-semibold text-foreground">{fmtCost(Number(m.total_cost))}</span>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                      <div className="h-full rounded-full bg-foreground/70 transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-border bg-card">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 mb-4">
            <DollarSign className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">Recent Review Costs</span>
          </div>
          {reviews.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-xs text-muted-foreground">No completed reviews yet</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 pr-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Repository</th>
                    <th className="text-left py-2 pr-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Model</th>
                    <th className="text-right py-2 pr-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Tokens</th>
                    <th className="text-right py-2 pr-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Cost</th>
                    <th className="text-right py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {reviews.map((r) => (
                    <tr key={r.id} className="border-b border-border/50 hover:bg-accent/50 transition-colors">
                      <td className="py-2 pr-4 font-medium text-foreground truncate max-w-40">{r.repository_name}</td>
                      <td className="py-2 pr-4 font-mono text-muted-foreground">{r.llm_model}</td>
                      <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">{Number(r.tokens_total).toLocaleString()}</td>
                      <td className="py-2 pr-4 text-right tabular-nums font-semibold text-foreground">{fmtCost(Number(r.estimated_cost))}</td>
                      <td className="py-2 text-right text-muted-foreground">
                        {new Date(r.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
