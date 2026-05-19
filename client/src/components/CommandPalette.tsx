import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { Command } from "cmdk";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { api } from "@/services/api";
import type { RootState } from "@/store";
import type { Review } from "@/types";
import { LayoutDashboard, FileSearch, Settings, Users, BarChart3, Hash, GitPullRequest, Search } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type NavItem = { to: string; label: string; icon: LucideIcon };

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Go to Dashboard", icon: LayoutDashboard },
  { to: "/reviews/manual", label: "New Review", icon: FileSearch },
  { to: "/settings", label: "Go to Settings", icon: Settings },
  { to: "/users", label: "Go to Users", icon: Users },
  { to: "/analytics", label: "Go to Analytics", icon: BarChart3 },
];

type SearchResult = { id: string; type: "review"; label: string; sub: string; to: string };

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const user = useSelector((state: RootState) => state.auth.user);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    setQuery("");
    setResults([]);
  }, [open]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const params = new URLSearchParams({ search: query.trim(), limit: "8" });
        const data = await api.get<{ reviews: Review[] }>(`/api/reviews?${params.toString()}`);
        setResults(
          (data.reviews ?? []).map((r: Review) => {
            const isPr = r.review_mode === "pr" || r.commit_hash?.startsWith("pr:");
            const label = isPr ? `PR #${r.commit_hash.replace("pr:", "").split(":")[0]}` : r.commit_hash.substring(0, 10);
            return {
              id: r.id,
              type: "review",
              label: `${r.repository_name || "Unknown"} — ${label}`,
              sub: r.ai_overview?.substring(0, 80) || r.created_at,
              to: `/reviews/${r.id}`,
            };
          }),
        );
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query]);

  const run = useCallback(
    (to: string) => {
      onOpenChange(false);
      navigate(to);
    },
    [navigate, onOpenChange],
  );

  const visibleNav = NAV_ITEMS.filter((item) => {
    if (item.to === "/users" || item.to === "/settings" || item.to === "/analytics") return user?.role === "admin";
    return true;
  });

  const filteredNav = query.trim()
    ? visibleNav.filter((item) => item.label.toLowerCase().includes(query.toLowerCase()))
    : visibleNav;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 shadow-lg max-w-lg [&>button]:hidden">
        <Command shouldFilter={false} className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-4 [&_[cmdk-input-wrapper]_svg]:w-4 [&_[cmdk-input]]:h-11 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-2.5 [&_[cmdk-item]_svg]:h-4 [&_[cmdk-item]_svg]:w-4">
          <div className="flex items-center border-b border-border px-3" cmdk-input-wrapper="">
            <Search className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
            <Command.Input
              placeholder="Search reviews, navigate..."
              value={query}
              onValueChange={setQuery}
              className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          <Command.List className="max-h-80 overflow-y-auto p-1">
            {query.trim() && searching && (
              <Command.Loading className="py-6 text-center text-sm text-muted-foreground">Searching...</Command.Loading>
            )}
            {query.trim() && !searching && results.length === 0 && (
              <Command.Empty className="py-6 text-center text-sm text-muted-foreground">No reviews found.</Command.Empty>
            )}
            {results.length > 0 && (
              <Command.Group heading="Reviews">
                {results.map((r) => {
                  const isPr = r.label.includes("PR #");
                  return (
                    <Command.Item
                      key={r.id}
                      onSelect={() => run(r.to)}
                      className="flex items-center gap-3 rounded-md px-2 py-2.5 text-sm cursor-pointer aria-selected:bg-accent aria-selected:text-accent-foreground"
                    >
                      {isPr ? <GitPullRequest className="h-4 w-4 text-muted-foreground shrink-0" /> : <Hash className="h-4 w-4 text-muted-foreground shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-foreground truncate block">{r.label}</span>
                        <span className="text-xs text-muted-foreground truncate block">{r.sub}</span>
                      </div>
                    </Command.Item>
                  );
                })}
              </Command.Group>
            )}
            {filteredNav.length > 0 && (
              <Command.Group heading="Navigation">
                {filteredNav.map((item) => (
                  <Command.Item
                    key={item.to}
                    onSelect={() => run(item.to)}
                    className="flex items-center gap-3 rounded-md px-2 py-2.5 text-sm cursor-pointer aria-selected:bg-accent aria-selected:text-accent-foreground"
                  >
                    <item.icon className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-medium text-foreground">{item.label}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
