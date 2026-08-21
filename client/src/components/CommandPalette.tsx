import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { Command } from "cmdk";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Kbd } from "@/components/shared";
import { api } from "@/services/api";
import type { RootState } from "@/store";
import type { Review } from "@/types";
import { LayoutDashboard, FileSearch, Settings, Users, BarChart3, Hash, GitPullRequest, Search, MoonStar } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type NavItem = { to: string; label: string; icon: LucideIcon; adminOnly?: boolean };

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Go to Dashboard", icon: LayoutDashboard },
  { to: "/reviews/manual", label: "Go to New Review", icon: FileSearch },
  { to: "/analytics", label: "Go to Analytics", icon: BarChart3, adminOnly: true },
  { to: "/users", label: "Go to Users", icon: Users, adminOnly: true },
  { to: "/settings", label: "Go to Settings", icon: Settings, adminOnly: true },
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

  const toggleTheme = useCallback(() => {
    const isDark = document.documentElement.classList.toggle("dark");
    window.localStorage.setItem("theme", isDark ? "dark" : "light");
    onOpenChange(false);
  }, [onOpenChange]);

  const visibleNav = NAV_ITEMS.filter((item) => {
    if (item.adminOnly) return isAdmin;
    return true;
  });

  const normalizedQuery = query.trim().toLowerCase();
  const matches = (label: string) => label.toLowerCase().includes(normalizedQuery);
  const showActions = !normalizedQuery || matches("new review") || matches("toggle theme");
  const filteredNav = normalizedQuery ? visibleNav.filter((item) => matches(item.label)) : visibleNav;
  const noMatches = Boolean(normalizedQuery) && !searching && results.length === 0 && !showActions && filteredNav.length === 0;

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        onOpenChange(false);
      }
    },
    [onOpenChange],
  );

  const itemClass =
    "flex cursor-pointer items-center gap-3 rounded-lg border-l-2 border-transparent px-2 py-2.5 text-sm outline-none aria-selected:border-interactive aria-selected:bg-accent aria-selected:text-accent-foreground";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden rounded-xl p-0 shadow-lg max-w-xl [&>button]:hidden">
        <Command shouldFilter={false} className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.14em] [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-4 [&_[cmdk-input-wrapper]_svg]:w-4 [&_[cmdk-input]]:h-11 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-2.5 [&_[cmdk-item]_svg]:h-4 [&_[cmdk-item]_svg]:w-4">
          <div className="flex items-center border-b border-border px-3" cmdk-input-wrapper="">
            <Search className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
            <Command.Input
              placeholder="Search reviews or run an action..."
              value={query}
              onValueChange={setQuery}
              onKeyDown={handleKeyDown}
              className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          <Command.List className="max-h-80 overflow-y-auto p-1 custom-scroll">
            {noMatches && (
              <Command.Empty className="py-6 text-center text-sm text-muted-foreground">No results found.</Command.Empty>
            )}
            {query.trim() && searching && (
              <Command.Loading className="py-6 text-center text-sm text-muted-foreground">Searching...</Command.Loading>
            )}
            {results.length > 0 && (
              <Command.Group heading="Reviews">
                {results.map((r) => {
                  const isPr = r.label.includes("PR #");
                  return (
                    <Command.Item
                      key={r.id}
                      onSelect={() => run(r.to)}
                      className={itemClass}
                    >
                      {isPr ? <GitPullRequest className="h-4 w-4 text-muted-foreground shrink-0" /> : <Hash className="h-4 w-4 text-muted-foreground shrink-0" />}
                      <div className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-foreground">{r.label}</span>
                        <span className="block truncate text-xs text-muted-foreground">{r.sub}</span>
                      </div>
                    </Command.Item>
                  );
                })}
              </Command.Group>
            )}
            {showActions && (
              <Command.Group heading="Actions">
                <Command.Item onSelect={() => run("/reviews/manual")} className={itemClass}>
                  <FileSearch className="h-4 w-4 text-interactive shrink-0" />
                  <span className="font-medium text-foreground">New review</span>
                  <Kbd className="ml-auto text-xs">N</Kbd>
                </Command.Item>
                <Command.Item onSelect={toggleTheme} className={itemClass}>
                  <MoonStar className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="font-medium text-foreground">Toggle theme</span>
                </Command.Item>
              </Command.Group>
            )}
            {filteredNav.length > 0 && (
              <Command.Group heading={query.trim() ? "Navigation" : "Go to"}>
                {filteredNav.map((item) => (
                  <Command.Item
                    key={item.to}
                    onSelect={() => run(item.to)}
                    className={itemClass}
                  >
                    <item.icon className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-medium text-foreground">{item.label}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}
          </Command.List>
          <div className="flex items-center gap-3 border-t border-border px-3 py-2 text-xs text-muted-foreground" aria-hidden="true">
            <span className="flex items-center gap-1">
              <Kbd className="h-4 min-w-4 px-1 text-[9px]">↑↓</Kbd>
              Navigate
            </span>
            <span className="flex items-center gap-1">
              <Kbd className="h-4 min-w-4 px-1 text-[9px]">↵</Kbd>
              Select
            </span>
            <span className="flex items-center gap-1">
              <Kbd className="h-4 min-w-4 px-1 text-[9px]">Esc</Kbd>
              Close
            </span>
            <span className="ml-auto hidden sm:inline">Press ? for all shortcuts</span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
