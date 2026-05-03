import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu, LogOut, LayoutDashboard, FileSearch, Settings, PanelLeft, PanelLeftClose } from "lucide-react";
import { useState, useEffect } from "react";
import type { LucideIcon } from "lucide-react";
import { motion } from "framer-motion";
import { BorderBeam } from "@/components/ui/border-beam";
import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { logout } from "../../store/authSlice";
import type { RootState, AppDispatch } from "../../store";

const allNavItems: { to: string; label: string; icon: LucideIcon; roles: string[] }[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, roles: ["admin", "user"] },
  { to: "/reviews/manual", label: "Manual Review", icon: FileSearch, roles: ["admin", "user"] },
  { to: "/settings", label: "Settings", icon: Settings, roles: ["admin"] },
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
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition-all duration-200 group",
                collapsed && "justify-center px-0 h-10 w-10 mx-auto",
                isActive
                  ? "bg-primary/10 text-primary shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] border border-primary/20"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-ink"
              )
            }
            title={collapsed ? item.label : undefined}
          >
            <Icon className={cn("h-4 w-4 flex-shrink-0 transition-transform group-hover:scale-110", collapsed && "h-5 w-5")} />
            {!collapsed && <span className="tracking-tight">{item.label}</span>}
          </NavLink>
        );
      })}
    </nav>
  );
}

export function Layout() {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const { user } = useSelector((state: RootState) => state.auth);
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    return window.localStorage.getItem("autoreview-sidebar-collapsed") === "true";
  });

  useEffect(() => {
    const prefersDark = window.localStorage.getItem("theme") !== "light";
    document.documentElement.classList.toggle("dark", prefersDark);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("autoreview-sidebar-collapsed", String(collapsed));
  }, [collapsed]);

  function handleLogout() {
    dispatch(logout());
    navigate("/login");
  }

  return (
    <div className="flex h-screen bg-background text-foreground antialiased font-sans">
      <motion.aside
        animate={{ width: collapsed ? 64 : 260 }}
        transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
        className="hidden flex-shrink-0 border-r border-muted/20 bg-card md:flex md:flex-col overflow-hidden z-20 shadow-2xl"
      >
        <div className={cn("relative overflow-hidden flex items-center gap-3 p-6 mb-2", collapsed && "flex-col gap-4")}>
          <BorderBeam size={50} duration={10} colorFrom="hsl(var(--primary))" colorTo="hsl(var(--primary) / 0.1)" borderWidth={1} />
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <img src="/favicon.svg" alt="" className="h-8 w-8 flex-shrink-0" />
            {!collapsed && (
              <span className="text-xl font-bold tracking-display text-ink truncate">
                Auto<span className="text-primary">Review</span>
              </span>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={() => setCollapsed(!collapsed)} className="h-8 w-8 text-muted-foreground hover:text-ink transition-colors">
            {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </Button>
        </div>

        <div className="flex-1 px-3 space-y-1">
          <NavLinks collapsed={collapsed} />
        </div>

        <div className="mt-auto border-t border-muted/20 p-4 bg-background/20">
          {collapsed ? (
            <div className="flex flex-col items-center gap-3">
              <AnimatedThemeToggler variant="circle" className="hover:bg-primary/10 rounded-md p-2 transition-colors text-muted-foreground hover:text-foreground [&>svg]:h-4 [&>svg]:w-4" />
              <Button variant="ghost" size="icon" onClick={handleLogout} className="hover:bg-red-500/10 hover:text-red-400 transition-colors">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3 px-2">
                <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary border border-primary/10">
                  {user?.username?.substring(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate text-ink">{user?.username}</p>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{user?.role}</p>
                </div>
                <AnimatedThemeToggler variant="circle" className="hover:bg-primary/10 rounded-md p-2 transition-colors text-muted-foreground hover:text-foreground [&>svg]:h-3.5 [&>svg]:w-3.5" />
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                className="w-full justify-start gap-3 text-muted-foreground hover:bg-red-500/10 hover:text-red-400 transition-colors px-3 h-9" 
                onClick={handleLogout}
              >
                <LogOut className="h-4 w-4" />
                <span className="text-xs font-semibold">Sign out</span>
              </Button>
            </div>
          )}
        </div>
      </motion.aside>

      <div className="flex flex-1 flex-col overflow-hidden bg-background relative">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(94,106,210,0.05),transparent_50%)] pointer-events-none" />
        
        <header className="flex items-center justify-between border-b border-muted/20 p-4 md:px-8 h-16 bg-background/50 backdrop-blur-md z-10 md:hidden">
          <div className="flex items-center gap-3">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="hover:bg-accent/50">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[280px] p-0 bg-card border-r border-muted/20">
                 <div className="p-6 mb-2 flex items-center gap-3">
                    <img src="/favicon.svg" alt="" className="h-8 w-8" />
                   <span className="text-xl font-bold tracking-display text-ink">Auto<span className="text-primary">Review</span></span>
                 </div>
                <div className="px-3">
                  <NavLinks onNavigate={() => setOpen(false)} />
                </div>
                <div className="absolute bottom-0 left-0 right-0 border-t border-muted/20 p-6 bg-background/20">
                   <div className="flex items-center gap-3 mb-6">
                    <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary border border-primary/10">
                      {user?.username?.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-ink">{user?.username}</p>
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{user?.role}</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" className="w-full justify-start gap-3 text-muted-foreground hover:bg-red-500/10 hover:text-red-400 transition-colors px-3 h-10" onClick={() => { handleLogout(); setOpen(false); }}>
                    <LogOut className="h-4 w-4" />
                    <span className="text-xs font-semibold">Sign out</span>
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
            <img src="/favicon.svg" alt="" className="h-6 w-6" />
            <span className="text-lg font-bold tracking-display text-ink">Auto<span className="text-primary">Review</span></span>
           </div>
         </header>

        <main className="flex-1 overflow-auto p-6 md:p-8 lg:p-12">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
