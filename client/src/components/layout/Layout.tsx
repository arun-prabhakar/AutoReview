import { Outlet, NavLink, useNavigate, useLocation, Link } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  Menu,
  LogOut,
  LayoutDashboard,
  FileSearch,
  Settings,
  PanelLeft,
  PanelLeftClose,
  Users,
  KeyRound,
  BarChart3,
  Search,
  ChevronRight,
} from "lucide-react";
import { useState, useEffect } from "react";
import type { LucideIcon } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { MOTION_EASE, fadeIn, useReducedMotionVariants } from "@/lib/motion";
import { Kbd } from "@/components/shared";
import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { logoutUser, changePassword } from "../../store/authSlice";
import { preloadPage } from "../../App";
import type { RootState, AppDispatch } from "../../store";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { useToast } from "@/hooks/use-toast";
import { NotificationBell } from "@/components/NotificationBell";
import { AboutIcon } from "@/components/AboutIcon";
import { CommandPalette } from "@/components/CommandPalette";

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);

type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  roles: string[];
  preload: Parameters<typeof preloadPage>[0];
};

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Workspace",
    items: [
      { to: "/", label: "Dashboard", icon: LayoutDashboard, roles: ["admin", "user"], preload: "Dashboard" },
      { to: "/reviews/manual", label: "New Review", icon: FileSearch, roles: ["admin", "user"], preload: "ManualReview" },
    ],
  },
  {
    label: "Insights",
    items: [{ to: "/analytics", label: "Analytics", icon: BarChart3, roles: ["admin"], preload: "Analytics" }],
  },
  {
    label: "Administration",
    items: [
      { to: "/settings", label: "Settings", icon: Settings, roles: ["admin"], preload: "Settings" },
      { to: "/users", label: "Users", icon: Users, roles: ["admin"], preload: "Users" },
    ],
  },
];

function NavLinks({ onNavigate, collapsed = false }: { onNavigate?: () => void; collapsed?: boolean }) {
  const { user } = useSelector((state: RootState) => state.auth);

  return (
    <nav className="flex flex-col" aria-label="Primary">
      {NAV_GROUPS.map((group, groupIndex) => {
        const visibleItems = group.items.filter((item) => user && item.roles.includes(user.role));
        if (visibleItems.length === 0) return null;
        return (
          <div key={group.label} className={cn(groupIndex > 0 && (collapsed ? "mt-2" : "mt-5"))}>
            {collapsed ? (
              groupIndex > 0 && <div className="mx-auto mb-2 h-px w-5 bg-border" aria-hidden="true" />
            ) : (
              <div
                className="px-3 pb-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground"
                aria-hidden="true"
              >
                {group.label}
              </div>
            )}
            <ul className="flex flex-col gap-0.5">
              {visibleItems.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.to === "/"}
                      onClick={onNavigate}
                      onMouseEnter={() => preloadPage(item.preload)}
                      title={collapsed ? item.label : undefined}
                      className={({ isActive }) =>
                        cn(
                          "group flex items-center rounded-lg text-sm font-medium outline-none transition-colors duration-fast ease-out-expo focus-visible:ring-2 focus-visible:ring-ring",
                          collapsed ? "mx-auto h-9 w-9 justify-center px-0" : "border-l-2 border-transparent gap-3 px-3 py-2",
                          isActive
                            ? cn("text-foreground", collapsed ? "rounded-full bg-secondary text-interactive" : "border-interactive bg-secondary/70")
                            : "text-muted-foreground hover:bg-accent hover:text-foreground"
                        )
                      }
                    >
                      <Icon
                        className={cn(
                          "h-4 w-4 flex-shrink-0 transition-transform duration-fast ease-out-expo group-hover:scale-110",
                          collapsed && "h-[18px] w-[18px]"
                        )}
                      />
                      {!collapsed && <span className="tracking-tight">{item.label}</span>}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

type Crumb = { label: string; to?: string };

function useRouteMeta(): { title: string; crumbs: Crumb[] } {
  const { pathname } = useLocation();
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0) {
    return { title: "Dashboard", crumbs: [] };
  }

  const root: Crumb = { label: "Dashboard", to: "/" };

  if (segments[0] === "reviews") {
    const reviewsCrumb: Crumb = { label: "Reviews" };
    if (segments[1] === "manual") {
      return { title: "New Review", crumbs: [root, reviewsCrumb] };
    }
    return { title: "Review Detail", crumbs: [root, reviewsCrumb] };
  }
  if (segments[0] === "analytics") return { title: "Analytics", crumbs: [root] };
  if (segments[0] === "settings") return { title: "Settings", crumbs: [root] };
  if (segments[0] === "users") return { title: "Users", crumbs: [root] };
  return { title: "Not Found", crumbs: [root] };
}

function Breadcrumbs({ crumbs, title }: { crumbs: Crumb[]; title: string }) {
  const fade = useReducedMotionVariants(fadeIn);
  return (
    <motion.nav variants={fade} initial="hidden" animate="visible" aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 text-xs">
        {crumbs.map((crumb) => (
          <li key={crumb.label} className="flex min-w-0 items-center gap-1.5">
            {crumb.to ? (
              <Link
                to={crumb.to}
                className="rounded-sm text-muted-foreground outline-none transition-colors duration-fast ease-out-expo hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                {crumb.label}
              </Link>
            ) : (
              <span className="text-muted-foreground">{crumb.label}</span>
            )}
            <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/60" aria-hidden="true" />
          </li>
        ))}
        <li className="min-w-0">
          <span className="truncate font-medium text-foreground" aria-current="page">
            {title}
          </span>
        </li>
      </ol>
    </motion.nav>
  );
}

function focusDashboardFilters() {
  const findControl = (): HTMLElement | null =>
    document.querySelector<HTMLElement>(
      '#main-content button[role="combobox"], #main-content input:not([type="hidden"]):not([disabled]), #main-content select:not([disabled])'
    );
  const attempt = (remaining: number) => {
    const control = findControl();
    if (control) {
      control.focus();
    } else if (remaining > 0) {
      window.setTimeout(() => attempt(remaining - 1), 100);
    }
  };
  attempt(10);
}

function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const rows: { keys: string[]; description: string }[] = [
    { keys: [IS_MAC ? "⌘" : "Ctrl", "K"], description: "Open command palette" },
    { keys: ["N"], description: "Start a new review" },
    { keys: ["/"], description: "Jump to dashboard filters" },
    { keys: ["?"], description: "Show keyboard shortcuts" },
    { keys: [IS_MAC ? "⌘" : "Ctrl", "⇧", "N"], description: "Start a new review (works anywhere)" },
    { keys: ["Esc"], description: "Close dialogs and menus" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
          <DialogDescription>Navigate AutoReview without leaving the keyboard.</DialogDescription>
        </DialogHeader>
        <ul className="divide-y divide-border">
          {rows.map((row) => (
            <li key={row.description} className="flex items-center justify-between gap-4 py-2.5">
              <span className="text-sm text-muted-foreground">{row.description}</span>
              <span className="flex shrink-0 items-center gap-1">
                {row.keys.map((key) => (
                  <Kbd key={key} className="text-xs">
                    {key}
                  </Kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

function ForcedPasswordChange() {
  const dispatch = useDispatch<AppDispatch>();
  const { user } = useSelector((state: RootState) => state.auth);
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const mustChange = user?.must_change_password === true;

  async function handleSubmit(currentPassword: string, newPassword: string) {
    setLoading(true);
    const result = await dispatch(changePassword({ current_password: currentPassword, new_password: newPassword }));
    setLoading(false);
    if (changePassword.fulfilled.match(result)) {
      toast({ title: "Password changed", variant: "success" });
    } else {
      setError(result.payload as string || "Failed to change password");
    }
  }

  return (
    <Dialog open={mustChange}>
      <DialogContent
        className="[&>button]:hidden sm:max-w-md"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Change Your Password</DialogTitle>
          <DialogDescription>
            Please set a new password before continuing
          </DialogDescription>
        </DialogHeader>

        <ChangePasswordForm onSubmit={handleSubmit} loading={loading} error={error} showCurrentPassword />
      </DialogContent>
    </Dialog>
  );
}

function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const dispatch = useDispatch<AppDispatch>();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(currentPassword: string, newPassword: string) {
    setLoading(true);
    const result = await dispatch(changePassword({ current_password: currentPassword, new_password: newPassword }));
    setLoading(false);
    if (changePassword.fulfilled.match(result)) {
      toast({ title: "Password changed", variant: "success" });
      onOpenChange(false);
    } else {
      setError((result.payload as string) || "Failed to change password");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change Password</DialogTitle>
        </DialogHeader>
        <ChangePasswordForm onSubmit={handleSubmit} loading={loading} error={error} showCurrentPassword />
      </DialogContent>
    </Dialog>
  );
}

export function Layout() {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useSelector((state: RootState) => state.auth);
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    return window.localStorage.getItem("autoreview-sidebar-collapsed") === "true";
  });
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const { title: pageTitle, crumbs } = useRouteMeta();
  const mobileTitleFade = useReducedMotionVariants(fadeIn);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen((o) => !o);
        return;
      }
      if (mod && e.shiftKey && e.key === "N") {
        e.preventDefault();
        navigate("/reviews/manual");
        return;
      }
      if (mod || e.altKey) return;

      const target = e.target as HTMLElement | null;
      if (target?.isContentEditable) return;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (document.querySelector('[role="dialog"]')) return;

      if (e.key === "n") {
        e.preventDefault();
        navigate("/reviews/manual");
      } else if (e.key === "/") {
        e.preventDefault();
        if (location.pathname !== "/") {
          navigate("/");
        }
        focusDashboardFilters();
      } else if (e.key === "?") {
        e.preventDefault();
        setShortcutsOpen(true);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [navigate, location.pathname]);

  useEffect(() => {
    const stored = window.localStorage.getItem("theme");
    const prefersDark = stored === "dark" || (!stored && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", prefersDark);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("autoreview-sidebar-collapsed", String(collapsed));
  }, [collapsed]);

  function handleLogout() {
    dispatch(logoutUser());
    navigate("/login");
  }

  return (
    <div className="flex h-screen bg-background text-foreground antialiased font-sans">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-4 focus:bg-background focus:text-foreground">Skip to content</a>
      <ForcedPasswordChange />
      <ChangePasswordDialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen} />
      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <motion.aside
        animate={{ width: collapsed ? 64 : 260 }}
        transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.3, ease: MOTION_EASE }}
        className="hidden flex-shrink-0 border-r border-border bg-card md:flex md:flex-col z-20 shadow-card"
      >
        <div className={cn("relative overflow-hidden flex items-center gap-3 p-6 pb-4", collapsed && "flex-col gap-4")}>
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <img src="/favicon.svg" alt="" className="h-8 w-8 flex-shrink-0" />
            {!collapsed && (
              <span className="truncate text-xl font-bold tracking-display text-ink">
                Auto<span className="text-foreground">Review</span>
              </span>
            )}
          </div>
          <Button variant="ghost" size="icon-sm" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={() => setCollapsed(!collapsed)} className="text-muted-foreground hover:text-ink">
            {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </Button>
        </div>

        <div className="custom-scroll flex-1 space-y-1 overflow-x-hidden overflow-y-auto px-3 py-2">
          <NavLinks collapsed={collapsed} />
        </div>

        <div className="mt-auto border-t border-border p-4">
          <div className="mb-3 flex items-center gap-3 px-1">
            <div className="flex h-8 w-8 flex-shrink-0 cursor-default items-center justify-center rounded-full bg-secondary text-xs font-bold text-foreground transition-all duration-fast ease-out-expo hover:ring-2 hover:ring-foreground/10">
              {(user?.name || user?.username)?.substring(0, 2).toUpperCase()}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{user?.name || user?.username}</p>
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{user?.role}</p>
              </div>
            )}
          </div>
          <div className={cn("flex items-center gap-1", collapsed ? "flex-col" : "justify-center")}>
            <AboutIcon />
            <NotificationBell placement="top-left" />
            <Button variant="ghost" size="icon-sm" aria-label="Change password" onClick={() => setChangePasswordOpen(true)} className="text-muted-foreground hover:text-foreground" title="Change Password">
              <KeyRound className="h-4 w-4" />
            </Button>
            <AnimatedThemeToggler variant="circle" className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors duration-fast ease-out-expo hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&>svg]:h-4 [&>svg]:w-4" aria-label="Toggle theme" />
            <Button variant="ghost" size="icon-sm" aria-label="Sign out" onClick={handleLogout} className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive" title="Sign out">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </motion.aside>

      <div className="relative flex flex-1 flex-col overflow-hidden bg-background">

        <header className="flex h-14 items-center justify-between gap-2 border-b border-border bg-background/80 px-3 backdrop-blur-md z-10 md:hidden">
          <div className="flex min-w-0 items-center gap-1.5">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Open menu" className="text-muted-foreground hover:text-foreground">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[280px] overflow-y-auto bg-card p-0 border-r border-border">
                <div className="mb-2 flex items-center gap-3 p-6 pb-4">
                  <img src="/favicon.svg" alt="" className="h-8 w-8" />
                  <span className="text-xl font-bold tracking-display text-ink">Auto<span className="text-foreground">Review</span></span>
                </div>
                <div className="px-3 pb-2">
                  <NavLinks onNavigate={() => setOpen(false)} />
                </div>
                <div className="absolute bottom-0 left-0 right-0 border-t border-border p-6">
                  <div className="mb-4 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-xs font-bold text-foreground">
                      {(user?.name || user?.username)?.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-ink">{user?.name || user?.username}</p>
                      <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{user?.role}</p>
                    </div>
                  </div>
                  <div className="mb-4 flex items-center gap-2">
                    <AnimatedThemeToggler variant="circle" className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-fast ease-out-expo hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&>svg]:h-4 [&>svg]:w-4" aria-label="Toggle theme" />
                    <Button variant="ghost" size="sm" className="h-8 flex-1 justify-start gap-2 rounded-lg px-3 text-xs font-semibold text-muted-foreground hover:text-foreground" onClick={() => { setChangePasswordOpen(true); setOpen(false); }}>
                      <KeyRound className="h-4 w-4" />
                      <span>Change Password</span>
                    </Button>
                  </div>
                  <Button variant="ghost" size="sm" className="h-10 w-full justify-start gap-3 rounded-lg px-3 text-xs font-semibold text-muted-foreground hover:bg-destructive/10 hover:text-destructive" onClick={() => { handleLogout(); setOpen(false); }}>
                    <LogOut className="h-4 w-4" />
                    <span>Sign out</span>
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
            <motion.div key={location.pathname} variants={mobileTitleFade} initial="hidden" animate="visible" className="min-w-0">
              <p className="text-[9px] font-semibold uppercase leading-none tracking-[0.18em] text-muted-foreground">AutoReview</p>
              <h1 className="truncate text-sm font-semibold leading-tight tracking-tight text-foreground">{pageTitle}</h1>
            </motion.div>
          </div>
          <div className="flex items-center gap-0.5">
            <Button variant="ghost" size="icon-sm" aria-label="Open command palette" onClick={() => setCommandOpen(true)} className="text-muted-foreground hover:text-foreground">
              <Search className="h-4 w-4" />
            </Button>
            <AboutIcon />
            <NotificationBell />
          </div>
        </header>

        <header className="hidden h-12 flex-shrink-0 items-center justify-between gap-4 border-b border-border bg-background/80 px-6 backdrop-blur-md z-10 md:flex">
          <Breadcrumbs key={location.pathname} crumbs={crumbs} title={pageTitle} />
          <button
            type="button"
            onClick={() => setCommandOpen(true)}
            aria-label="Open command palette"
            className="flex h-8 cursor-pointer items-center gap-2 rounded-lg border border-border bg-card pl-2.5 pr-1.5 text-xs text-muted-foreground shadow-card outline-none transition-colors duration-fast ease-out-expo hover:border-foreground/25 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Search className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden lg:inline">Search reviews, run actions...</span>
            <span className="ml-1 flex items-center gap-0.5" aria-hidden="true">
              <Kbd className="h-5 min-w-5 text-xs">{IS_MAC ? "⌘" : "Ctrl"}</Kbd>
              <Kbd className="h-5 min-w-5 text-xs">K</Kbd>
            </span>
          </button>
        </header>

        <main id="main-content" className="flex-1 overflow-auto px-4 pt-2 pb-4 md:px-6 md:pt-3 md:pb-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
