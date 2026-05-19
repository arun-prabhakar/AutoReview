import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { Command } from "cmdk";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { api } from "@/services/api";
import type { RootState } from "@/store";
import type { Review } from "@/types";
import { LayoutDashboard, FileSearch, Settings, Users, BarChart3, Hash, GitPullRequest, Search, Keyboard } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type NavItem = { to: string; label: string; icon: LucideIcon; shortcut: string; adminOnly?: boolean };

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, shortcut: "D" },
  { to: "/reviews/manual", label: "New Review", icon: FileSearch, shortcut: "N" },
  { to: "/settings", label: "Settings", icon: Settings, shortcut: "S", adminOnly: true },
  { to: "/users", label: "Users", icon: Users, shortcut: "U", adminOnly: true },
  { to: "/analytics", label: "Analytics", icon: BarChart3, shortcut: "A", adminOnly: true },
];

type SearchResult = { id: string; type: "review"; label: string; sub: string; to: string };

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const user = useSelector((state: RootState) => state.auth.user);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const isAdmin = user?.role === "admin";

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
    if (item.adminOnly) return isAdmin;
    return true;
  });

  const filteredNav = query.trim()
    ? visibleNav.filter((item) => item.label.toLowerCase().includes(query.toLowerCase()))
    : visibleNav;

  const shortcutMap = new Map<string, string>();
  for (const item of visibleNav) {
    shortcutMap.set(item.shortcut.toLowerCase(), item.to);
  }

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        onOpenChange(false);
        return;
      }
      const ch = e.key.toLowerCase();
      if (ch.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const target = shortcutMap.get(ch);
        if (target) {
          e.preventDefault();
          run(target);
        }
      }
    },
    [shortcutMap, run, onOpenChange],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 shadow-lg max-w-xl [&>button]:hidden">
        <Command shouldFilter={false} className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-4 [&_[cmdk-input-wrapper]_svg]:w-4 [&_[cmdk-input]]:h-11 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-2.5 [&_[cmdk-item]_svg]:h-4 [&_[cmdk-item]_svg]:w-4">
          <div className="flex items-center border-b border-border px-3" cmdk-input-wrapper="">
            <Search className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
            <Command.Input
              placeholder="Search reviews or type a shortcut..."
              value={query}
              onValueChange={setQuery}
              onKeyDown={handleKeyDown}
              className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          <Command.List className="max-h-80 overflow-y-auto p-1">
            {!query.trim() && (
              <div className="px-2 py-2 border-b border-border mb-1">
                <div className="flex items-center gap-1.5 mb-2 text-[10px] text-muted-foreground">
                  <Keyboard className="h-3 w-3" />
                  <span className="font-medium">Shortcuts</span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  {visibleNav.map((item) => (
                    <div key={item.to} className="flex items-center justify-between text-xs py-0.5">
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <item.icon className="h-3 w-3" />
                        {item.label}
                      </span>
                      <kbd className="rounded border border-border bg-secondary px-1.5 font-mono text-[10px] font-medium text-muted-foreground">{item.shortcut}</kbd>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-4 mt-2 pt-1.5 border-t border-border/50 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1"><kbd className="rounded border border-border bg-secondary px-1 font-mono">↑↓</kbd> Navigate</span>
                  <span className="flex items-center gap-1"><kbd className="rounded border border-border bg-secondary px-1 font-mono">↵</kbd> Open</span>
                  <span className="flex items-center gap-1"><kbd className="rounded border border-border bg-secondary px-1 font-mono">Esc</kbd> Close</span>
                </div>
              </div>
            )}
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
              <Command.Group heading={query.trim() ? "Navigation" : undefined}>
                {filteredNav.map((item) => (
                  <Command.Item
                    key={item.to}
                    onSelect={() => run(item.to)}
                    className="flex items-center gap-3 rounded-md px-2 py-2.5 text-sm cursor-pointer aria-selected:bg-accent aria-selected:text-accent-foreground"
                  >
                    <item.icon className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-medium text-foreground">{item.label}</span>
                    <kbd className="ml-auto rounded border border-border bg-secondary px-1.5 font-mono text-[10px] font-medium text-muted-foreground">{item.shortcut}</kbd>
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
