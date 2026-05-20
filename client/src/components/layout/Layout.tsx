import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu, LogOut, LayoutDashboard, FileSearch, Settings, Users, KeyRound, BarChart3, Search } from "lucide-react";
import { useState, useEffect } from "react";
import type { LucideIcon } from "lucide-react";
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

const allNavItems: { to: string; label: string; icon: LucideIcon; roles: string[]; preload: string }[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, roles: ["admin", "user"], preload: "Dashboard" },
  { to: "/reviews/manual", label: "Manual Review", icon: FileSearch, roles: ["admin", "user"], preload: "ManualReview" },
  { to: "/analytics", label: "Analytics", icon: BarChart3, roles: ["admin"], preload: "Analytics" },
  { to: "/users", label: "Users", icon: Users, roles: ["admin"], preload: "Users" },
  { to: "/settings", label: "Settings", icon: Settings, roles: ["admin"], preload: "Settings" },
];

function NavLinks({ onNavigate, collapsed }: { onNavigate?: () => void; collapsed?: boolean }) {
  const { user } = useSelector((state: RootState) => state.auth);
  const visibleItems = allNavItems.filter((item) => user && item.roles.includes(user.role));

  return (
    <nav className="flex flex-col gap-1">
      {visibleItems.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            onClick={onNavigate}
            onMouseEnter={() => preloadPage(item.preload as Parameters<typeof preloadPage>[0])}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 group",
                collapsed && "justify-center px-0 h-9 w-9 mx-auto",
                isActive
                  ? "bg-purple-dim text-purple-accent"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )
            }
            title={collapsed ? item.label : undefined}
          >
            <Icon className={cn("h-4 w-4 flex-shrink-0 transition-transform group-hover:scale-110", collapsed && "h-[18px] w-[18px]")} />
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        );
      })}
    </nav>
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
  const { user } = useSelector((state: RootState) => state.auth);
  const [open, setOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "k") {
        e.preventDefault();
        setCommandOpen((o) => !o);
      }
      if (mod && e.shiftKey && e.key === "N") {
        e.preventDefault();
        navigate("/reviews/manual");
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [navigate]);

  useEffect(() => {
    const stored = window.localStorage.getItem("theme");
    document.documentElement.classList.toggle("dark", stored !== "light");
  }, []);

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
      <aside className="hidden flex-shrink-0 w-12 border-r border-border bg-card md:flex md:flex-col z-20 items-center py-4">
        <img src="/favicon.svg" alt="" className="h-8 w-8 mb-6" />

        <div className="flex-1 flex flex-col items-center gap-1 w-full px-2">
          <NavLinks collapsed />
        </div>

        <div className="flex flex-col items-center gap-1 w-full px-2 mt-auto">
          <AboutIcon />
          <NotificationBell placement="top-left" />
          <button
            aria-label="Change password"
            onClick={() => setChangePasswordOpen(true)}
            className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <KeyRound className="h-4 w-4" />
          </button>
          <AnimatedThemeToggler variant="circle" className="h-8 w-8 hover:bg-accent rounded-lg flex items-center justify-center transition-colors text-muted-foreground hover:text-foreground [&>svg]:h-4 [&>svg]:w-4" />
          <button
            aria-label="Sign out"
            onClick={handleLogout}
            className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden dot-grid relative">

        <header className="flex items-center justify-between border-b border-border p-4 md:px-8 h-16 bg-background/80 backdrop-blur-md z-10 md:hidden">
          <div className="flex items-center gap-3">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Open menu" className="hover:bg-accent/50">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[280px] p-0 bg-card border-r border-muted/20">
                 <div className="p-6 mb-2 flex items-center gap-3">
                    <img src="/favicon.svg" alt="" className="h-8 w-8" />
                   <span className="text-xl font-bold tracking-display text-ink">Auto<span className="text-foreground">Review</span></span>
                 </div>
                <div className="px-3">
                  <NavLinks onNavigate={() => setOpen(false)} />
                </div>
                <div className="absolute bottom-0 left-0 right-0 border-t border-border p-6">
                   <div className="flex items-center gap-3 mb-4">
                    <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center text-xs font-bold text-foreground">
                      {(user?.name || user?.username)?.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-ink">{user?.name || user?.username}</p>
                      <p className="text-xs uppercase tracking-widest text-muted-foreground">{user?.role}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mb-4">
                    <AnimatedThemeToggler variant="circle" className="h-8 w-8 hover:bg-accent rounded-md flex items-center justify-center transition-colors text-muted-foreground hover:text-foreground [&>svg]:h-4 [&>svg]:w-4" />
                    <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors px-3 h-8 flex-1 justify-start" onClick={() => { setChangePasswordOpen(true); setOpen(false); }}>
                      <KeyRound className="h-4 w-4" />
                      <span className="text-xs font-semibold">Change Password</span>
                    </Button>
                  </div>
                  <Button variant="ghost" size="sm" className="w-full justify-start gap-3 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors px-3 h-10" onClick={() => { handleLogout(); setOpen(false); }}>
                    <LogOut className="h-4 w-4" />
                    <span className="text-xs font-semibold">Sign out</span>
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
            <img src="/favicon.svg" alt="" className="h-6 w-6" />
            <span className="text-lg font-bold tracking-display text-ink">Auto<span className="text-foreground">Review</span></span>
           </div>
           <div className="flex items-center gap-1">
             <AboutIcon />
             <NotificationBell />
           </div>
           </header>

        <div className="hidden md:flex items-center justify-center border-b border-border h-12 bg-card/80 backdrop-blur-md z-10">
          <button
            type="button"
            onClick={() => setCommandOpen(true)}
            className="flex items-center gap-3 h-8 w-full max-w-lg mx-8 rounded-lg border border-border bg-background px-3 text-sm text-muted-foreground hover:bg-accent hover:border-border transition-colors cursor-pointer"
          >
            <Search className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1 text-left">Search reviews, navigate...</span>
            <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-0.5 rounded border border-border bg-secondary px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
              {typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent) ? "⌘" : "Ctrl"} K
            </kbd>
          </button>
        </div>

        <div className="flex items-center justify-center md:hidden px-4 py-2 border-b border-border bg-background">
          <button
            type="button"
            onClick={() => setCommandOpen(true)}
            className="flex items-center gap-2 h-8 w-full max-w-md rounded-lg border border-border bg-card px-3 text-xs text-muted-foreground"
          >
            <Search className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1 text-left">Search reviews...</span>
          </button>
        </div>

        <main id="main-content" className="flex-1 overflow-auto px-4 pt-2 pb-4 md:px-6 md:pt-3 md:pb-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
