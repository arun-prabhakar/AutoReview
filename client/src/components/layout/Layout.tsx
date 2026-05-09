import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu, LogOut, LayoutDashboard, FileSearch, Settings, PanelLeft, PanelLeftClose, Users, KeyRound } from "lucide-react";
import { useState, useEffect } from "react";
import type { LucideIcon } from "lucide-react";
import { motion } from "framer-motion";
import { BorderBeam } from "@/components/ui/border-beam";
import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { logout, changePassword } from "../../store/authSlice";
import type { RootState, AppDispatch } from "../../store";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

const allNavItems: { to: string; label: string; icon: LucideIcon; roles: string[] }[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, roles: ["admin", "user"] },
  { to: "/reviews/manual", label: "Manual Review", icon: FileSearch, roles: ["admin", "user"] },
  { to: "/users", label: "Users", icon: Users, roles: ["admin"] },
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
                  ? "bg-secondary text-foreground font-semibold"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
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

function ForcedPasswordChange() {
  const dispatch = useDispatch<AppDispatch>();
  const { user } = useSelector((state: RootState) => state.auth);
  const { toast } = useToast();
  
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const mustChange = user?.must_change_password === true;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    
    if (newPassword.length < 6) {
      setError("New password must be at least 6 characters");
      return;
    }
    
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match");
      return;
    }
    
    setLoading(true);
    const result = await dispatch(changePassword({ current_password: currentPassword, new_password: newPassword }));
    setLoading(false);
    
    if (changePassword.fulfilled.match(result)) {
      toast({ title: "Password changed" });
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
        
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          {error && (
            <div className="rounded-md bg-secondary px-3 py-2 text-sm text-destructive">{error}</div>
          )}
          
          <div className="space-y-2">
            <Label htmlFor="current_password">Current Password</Label>
            <Input
              id="current_password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="new_password">New Password</Label>
            <Input
              id="new_password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="confirm_password">Confirm New Password</Label>
            <Input
              id="confirm_password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>
          
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Changing..." : "Change Password"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const dispatch = useDispatch<AppDispatch>();
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (newPassword.length < 6) { setError("New password must be at least 6 characters"); return; }
    if (newPassword !== confirmPassword) { setError("New passwords do not match"); return; }
    setLoading(true);
    const result = await dispatch(changePassword({ current_password: currentPassword, new_password: newPassword }));
    setLoading(false);
    if (changePassword.fulfilled.match(result)) {
      toast({ title: "Password changed" });
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
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
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {error && <div className="rounded-md bg-secondary px-3 py-2 text-sm text-destructive">{error}</div>}
          <div className="space-y-2"><Label>Current Password</Label><Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required /></div>
          <div className="space-y-2"><Label>New Password</Label><Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={6} /></div>
          <div className="space-y-2"><Label>Confirm New Password</Label><Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={6} /></div>
          <Button type="submit" className="w-full" disabled={loading}>{loading ? "Changing..." : "Change Password"}</Button>
        </form>
      </DialogContent>
    </Dialog>
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
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem("theme");
    const prefersDark = stored === "dark" || (!stored && window.matchMedia("(prefers-color-scheme: dark)").matches);
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
      <ForcedPasswordChange />
      <ChangePasswordDialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen} />
      <motion.aside
        animate={{ width: collapsed ? 64 : 260 }}
        transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
        className="hidden flex-shrink-0 border-r border-border bg-card md:flex md:flex-col overflow-hidden z-20 shadow-card"
      >
        <div className={cn("relative overflow-hidden flex items-center gap-3 p-6 mb-2", collapsed && "flex-col gap-4")}>
          <BorderBeam size={50} duration={10} colorFrom="#e5e5e5" colorTo="#e5e5e51a" borderWidth={1} />
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <img src="/favicon.svg" alt="" className="h-8 w-8 flex-shrink-0" />
            {!collapsed && (
                <span className="text-xl font-bold tracking-display text-ink truncate">
                Auto<span className="text-foreground">Review</span>
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

        <div className="mt-auto border-t border-border p-4">
          <div className="flex items-center gap-3 px-1 mb-3">
            <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center text-[10px] font-bold text-foreground flex-shrink-0">
              {user?.username?.substring(0, 2).toUpperCase()}
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate text-foreground">{user?.username}</p>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{user?.role}</p>
              </div>
            )}
          </div>
          <div className={cn("flex items-center gap-1", collapsed ? "flex-col" : "justify-center")}>
            <Button variant="ghost" size="icon" onClick={() => setChangePasswordOpen(true)} className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors" title="Change Password">
              <KeyRound className="h-4 w-4" />
            </Button>
            <AnimatedThemeToggler variant="circle" className="h-8 w-8 hover:bg-accent rounded-md flex items-center justify-center transition-colors text-muted-foreground hover:text-foreground [&>svg]:h-4 [&>svg]:w-4" />
            <Button variant="ghost" size="icon" onClick={handleLogout} className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors" title="Sign out">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </motion.aside>

      <div className="flex flex-1 flex-col overflow-hidden bg-background relative">
        
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
                <div className="absolute bottom-0 left-0 right-0 border-t border-border p-6">
                   <div className="flex items-center gap-3 mb-6">
                    <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center text-xs font-bold text-foreground">
                      {user?.username?.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-ink">{user?.username}</p>
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{user?.role}</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" className="w-full justify-start gap-3 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors px-3 h-10" onClick={() => { handleLogout(); setOpen(false); }}>
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
