import { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { motion } from "motion/react";
import { api } from "@/services/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Table, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CopyButton, EmptyState, PageHeader, StatCard, TableSkeleton } from "@/components/shared";
import { useToast } from "@/hooks/use-toast";
import { KeyRound, Pencil, Plus, Search, SearchX, ShieldCheck, Trash2, UserX, Users as UsersIcon, X } from "lucide-react";
import { validateSession } from "@/store/authSlice";
import type { RootState, AppDispatch } from "@/store";
import { fadeIn, fadeInUp, staggerContainer, useReducedMotionVariants } from "@/lib/motion";
import { cn } from "@/lib/utils";

type User = { id: string; username: string; name: string | null; role: string; must_change_password: number; created_at: string };

const MIN_PASSWORD_LENGTH = 4;

function getInitials(user: User): string {
  const source = (user.name || user.username).trim();
  if (!source) return "?";
  const parts = source.split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const second = parts[1]?.[0] ?? "";
  if (first && second) return (first + second).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

function PasswordHint({ id, value }: { id: string; value: string }) {
  const meetsMin = value.length >= MIN_PASSWORD_LENGTH;
  const text = !value
    ? `Must be at least ${MIN_PASSWORD_LENGTH} characters.`
    : meetsMin
      ? "Meets the minimum length requirement."
      : `Too short — ${value.length} of ${MIN_PASSWORD_LENGTH} characters.`;
  return (
    <p id={id} aria-live="polite" className={cn("text-xs", meetsMin ? "text-interactive" : "text-muted-foreground")}>
      {text}
    </p>
  );
}

export default function Users() {
  const { toast } = useToast();
  const dispatch = useDispatch<AppDispatch>();
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [autoGenPassword, setAutoGenPassword] = useState(true);
  const [manualPassword, setManualPassword] = useState("");
  const [createdPassword, setCreatedPassword] = useState<string | null>(null);
  const [resetPasswordUser, setResetPasswordUser] = useState<User | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editTarget, setEditTarget] = useState<User | null>(null);
  const [editRole, setEditRole] = useState<string>("user");
  const [editUsername, setEditUsername] = useState<string>("");
  const [editName, setEditName] = useState<string>("");

  const listVariants = useReducedMotionVariants(staggerContainer);
  const rowVariants = useReducedMotionVariants(fadeIn);
  const statVariants = useReducedMotionVariants(fadeInUp);

  useEffect(() => { loadUsers(); }, []);

  const loadUsers = async () => {
    setLoadingUsers(true);
    try {
      const data = await api.get<User[]>("/api/auth/users");
      setUsers(data);
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to load users", variant: "destructive" });
    } finally {
      setLoadingUsers(false);
    }
  };

  const adminCount = users.filter((u) => u.role === "admin").length;
  const isSelf = (u: User) => currentUser?.id === u.id;

  const deleteBlockedReason = (u: User): string | null => {
    if (isSelf(u)) return "You can't delete your own account.";
    if (u.role === "admin" && adminCount <= 1) return "You can't delete the last remaining admin.";
    return null;
  };

  const roleLockReason = (u: User | null): string | null => {
    if (!u || u.role !== "admin") return null;
    if (isSelf(u)) return "You can't demote your own admin role.";
    if (adminCount <= 1) return "You can't remove the last admin role.";
    return null;
  };

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (!q) return true;
      return u.username.toLowerCase().includes(q) || (u.name ?? "").toLowerCase().includes(q);
    });
  }, [users, searchQuery, roleFilter]);

  const hasActiveFilters = searchQuery.trim() !== "" || roleFilter !== "all";
  const clearFilters = () => { setSearchQuery(""); setRoleFilter("all"); };

  const generatePassword = () => {
    const chars = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%";
    const array = new Uint32Array(12);
    crypto.getRandomValues(array);
    return Array.from(array, (n) => chars[n % chars.length]).join("");
  };

  const handleAddUser = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const password = autoGenPassword ? generatePassword() : manualPassword;
    if (!password || password.length < MIN_PASSWORD_LENGTH) {
      toast({ title: "Error", description: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`, variant: "destructive" });
      return;
    }
    try {
      await api.post("/api/auth/users", { username: fd.get("username"), password, role: fd.get("role"), name: fd.get("name") || null });
      setUserDialogOpen(false);
      setAutoGenPassword(true);
      setManualPassword("");
      setCreatedPassword(password);
      loadUsers();
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to add user", variant: "destructive" });
    }
  };

  const handleResetPassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!resetPasswordUser) return;
    if (resetPasswordValue.length < MIN_PASSWORD_LENGTH) {
      toast({ title: "Error", description: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`, variant: "destructive" });
      return;
    }
    try {
      await api.put(`/api/auth/users/${resetPasswordUser.id}/password`, { password: resetPasswordValue });
      toast({ title: "Password reset", variant: "success" });
      setResetPasswordUser(null);
      setResetPasswordValue("");
      loadUsers();
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to reset password", variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const blockedReason = deleteBlockedReason(deleteTarget);
    if (blockedReason) {
      toast({ title: "Error", description: blockedReason, variant: "destructive" });
      setDeleteTarget(null);
      return;
    }
    setDeleting(true);
    try {
      await api.del(`/api/auth/users/${deleteTarget.id}`);
      toast({ title: "User deleted", variant: "success" });
      setDeleteTarget(null);
      loadUsers();
    } catch (err) {
      toast({ title: "Delete failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const handleEditUser = async () => {
    if (!editTarget) return;
    if (editTarget.role === "admin" && editRole !== "admin" && roleLockReason(editTarget)) {
      toast({ title: "Error", description: roleLockReason(editTarget), variant: "destructive" });
      return;
    }
    try {
      await api.put(`/api/auth/users/${editTarget.id}`, { username: editUsername, name: editName, role: editRole });
      toast({ title: "User updated", variant: "success" });
      setEditTarget(null);
      loadUsers();
      if (currentUser?.id === editTarget.id) {
        dispatch(validateSession());
      }
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to update user", variant: "destructive" });
    }
  };

  const resetDialogHintId = "reset-password-hint";
  const createDialogHintId = "create-password-hint";

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-6">
        <PageHeader
          title="Users"
          description="Manage accounts, roles, and passwords for everyone with access to AutoReview."
          actions={
            <Dialog open={userDialogOpen} onOpenChange={(o) => { setUserDialogOpen(o); if (o) { setAutoGenPassword(true); setManualPassword(""); } }}>
              <DialogTrigger asChild>
                <Button className="font-semibold shadow-sm"><Plus className="h-4 w-4" />Add User</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add User</DialogTitle>
                  <DialogDescription>Create a new account and choose how its initial password is set.</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleAddUser} className="space-y-4">
                  <div className="space-y-2"><Label htmlFor="new-user-name">Name</Label><Input id="new-user-name" name="name" placeholder="Display name (optional)" /></div>
                  <div className="space-y-2"><Label htmlFor="new-user-username">Username</Label><Input id="new-user-username" name="username" required autoComplete="off" /></div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="new-user-password">Password</Label>
                      <Button type="button" variant="ghost" size="sm" className="text-xs text-interactive" onClick={() => setAutoGenPassword(!autoGenPassword)}>
                        {autoGenPassword ? "Enter manually" : "Auto-generate"}
                      </Button>
                    </div>
                    {autoGenPassword ? (
                      <p className="text-sm text-muted-foreground">A secure password will be generated automatically.</p>
                    ) : (
                      <div className="space-y-2">
                        <Input id="new-user-password" type="password" value={manualPassword} onChange={(e) => setManualPassword(e.target.value)} required minLength={MIN_PASSWORD_LENGTH} placeholder={`Min ${MIN_PASSWORD_LENGTH} characters`} aria-describedby={createDialogHintId} autoComplete="new-password" />
                        <PasswordHint id={createDialogHintId} value={manualPassword} />
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Role</Label>
                    <Select name="role" defaultValue="user">
                      <SelectTrigger aria-label="Role"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">User</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="submit" className="w-full" disabled={!autoGenPassword && manualPassword.length > 0 && manualPassword.length < MIN_PASSWORD_LENGTH}>Create User</Button>
                </form>
              </DialogContent>
            </Dialog>
          }
        />

        <motion.div variants={listVariants} initial="hidden" animate="visible" className="grid grid-cols-2 gap-4">
          <motion.div variants={statVariants}>
            <StatCard label="Total Users" value={loadingUsers ? "—" : users.length} icon={<UsersIcon />} />
          </motion.div>
          <motion.div variants={statVariants}>
            <StatCard label="Admins" value={loadingUsers ? "—" : adminCount} icon={<ShieldCheck />} />
          </motion.div>
        </motion.div>

        <div className="flex flex-wrap items-center gap-2.5 rounded-lg bg-secondary/50 px-3 py-2">
          <div className="relative w-full sm:max-w-xs">
            <Input
              icon={<Search />}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search name or username"
              aria-label="Search users by name or username"
              className={cn("pr-8", searchQuery && "border-interactive/40 bg-interactive/10")}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm text-interactive transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger
              aria-label="Filter users by role"
              className={cn("h-9 w-36 border-border bg-card text-sm", roleFilter !== "all" && "border-interactive/40 bg-interactive/10 text-interactive")}
            >
              <SelectValue placeholder="All Roles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              <SelectItem value="admin">Admins</SelectItem>
              <SelectItem value="user">Users</SelectItem>
            </SelectContent>
          </Select>

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" className="text-xs text-interactive" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </div>

        {loadingUsers ? (
          <TableSkeleton rows={5} columns={5} />
        ) : users.length === 0 ? (
          <Card className="border-border bg-card">
            <CardContent className="p-0">
              <EmptyState
                icon={<UserX />}
                title="No users yet"
                description="Create the first user to grant access to AutoReview."
                action={
                  <Button size="sm" className="font-semibold shadow-sm" onClick={() => { setAutoGenPassword(true); setManualPassword(""); setUserDialogOpen(true); }}>
                    <Plus className="h-4 w-4" />Add User
                  </Button>
                }
              />
            </CardContent>
          </Card>
        ) : (
          <Card className="border-border bg-card">
            <CardHeader className="border-b border-border pb-4">
              <div className="flex items-center gap-3">
                <CardTitle className="text-sm font-semibold uppercase tracking-tight text-muted-foreground">Users</CardTitle>
                <span className="text-xs text-muted-foreground" aria-live="polite">
                  {filteredUsers.length} of {users.length} {users.length === 1 ? "user" : "users"}
                </span>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {filteredUsers.length === 0 ? (
                <EmptyState
                  icon={<SearchX />}
                  title="No users match your filters"
                  description="Try a different name or username, or clear the filters to see every user."
                  action={
                    <Button variant="ghost" size="sm" className="text-interactive" onClick={clearFilters}>
                      Clear filters
                    </Button>
                  }
                />
              ) : (
                <Table className="min-w-[720px]">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>User</TableHead>
                      <TableHead className="w-24">Role</TableHead>
                      <TableHead className="w-48">Status</TableHead>
                      <TableHead className="w-28">Created</TableHead>
                      <TableHead className="w-px"><span className="sr-only">Actions</span></TableHead>
                    </TableRow>
                  </TableHeader>
                  <motion.tbody
                    key={roleFilter}
                    variants={listVariants}
                    initial="hidden"
                    animate="visible"
                    className="[&_tr:last-child]:border-0"
                  >
                    {filteredUsers.map((u) => {
                      const blockedReason = deleteBlockedReason(u);
                      return (
                        <motion.tr key={u.id} variants={rowVariants} className="border-b border-border transition-colors hover:bg-accent/50">
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold uppercase text-secondary-foreground">
                                {getInitials(u)}
                              </span>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <p className="truncate text-sm font-medium">{u.name || u.username}</p>
                                  {isSelf(u) && <span className="shrink-0 text-xs text-muted-foreground">(you)</span>}
                                </div>
                                {u.name && <p className="truncate text-xs text-muted-foreground">@{u.username}</p>}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={u.role === "admin" ? "default" : "secondary"} className="capitalize">{u.role}</Badge>
                          </TableCell>
                          <TableCell>
                            {!!u.must_change_password ? (
                              <Badge variant="warning">Must change password</Badge>
                            ) : (
                              <span className="text-muted-foreground" title="No pending issues">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <span className="text-xs text-muted-foreground" title={new Date(u.created_at).toLocaleString()}>
                              {new Date(u.created_at).toLocaleDateString()}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-xs"
                                aria-label={`Reset password for ${u.username}`}
                                onClick={() => { setResetPasswordUser(u); setResetPasswordValue(""); }}
                              >
                                <KeyRound className="h-3.5 w-3.5" />
                                Reset
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`Edit user ${u.username}`}
                                onClick={() => { setEditTarget(u); setEditUsername(u.username); setEditName(u.name || ""); setEditRole(u.role); }}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              {blockedReason ? (
                                <>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="inline-flex">
                                        <Button variant="ghost" size="icon" disabled aria-label={`Delete user ${u.username}`}>
                                          <Trash2 className="h-4 w-4 text-destructive" />
                                        </Button>
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent>{blockedReason}</TooltipContent>
                                  </Tooltip>
                                  <span className="sr-only">{blockedReason}</span>
                                </>
                              ) : (
                                <Button variant="ghost" size="icon" aria-label={`Delete user ${u.username}`} onClick={() => setDeleteTarget(u)}>
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </motion.tr>
                      );
                    })}
                  </motion.tbody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}

        <Dialog open={!!resetPasswordUser} onOpenChange={(o) => { if (!o) { setResetPasswordUser(null); setResetPasswordValue(""); } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reset Password for {resetPasswordUser?.username}</DialogTitle>
              <DialogDescription>Set a new password for this account.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reset-password">New Password</Label>
                <Input
                  id="reset-password"
                  type="password"
                  value={resetPasswordValue}
                  onChange={(e) => setResetPasswordValue(e.target.value)}
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  aria-describedby={resetDialogHintId}
                  autoComplete="new-password"
                />
                <PasswordHint id={resetDialogHintId} value={resetPasswordValue} />
              </div>
              <Button type="submit" className="w-full" disabled={resetPasswordValue.length > 0 && resetPasswordValue.length < MIN_PASSWORD_LENGTH}>
                Reset Password
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={!!createdPassword} onOpenChange={(o) => !o && setCreatedPassword(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>User Created</DialogTitle>
              <DialogDescription>Share this password with the user. They will be asked to change it on first login.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-md bg-secondary p-3">
                <code className="flex-1 break-all font-mono text-sm">{createdPassword}</code>
                <CopyButton value={createdPassword ?? ""} label="Copy password" toastLabel="Password copied to clipboard" className="shrink-0" />
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={!!editTarget} onOpenChange={(open) => { if (!open) setEditTarget(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit User</DialogTitle>
              <DialogDescription>Update this user's profile details and role.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Name</Label>
                <Input id="edit-name" value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Display name" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-username">Username</Label>
                <Input id="edit-username" value={editUsername} onChange={(e) => setEditUsername(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={editRole} onValueChange={setEditRole}>
                  <SelectTrigger aria-label="Role"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user" disabled={!!roleLockReason(editTarget)}>User</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
                {roleLockReason(editTarget) && <p className="text-xs text-muted-foreground">{roleLockReason(editTarget)}</p>}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
              <Button onClick={handleEditUser}>Save Changes</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <Trash2 className="h-4 w-4" />
                Delete User
              </DialogTitle>
              <DialogDescription className="pt-1">
                Permanently delete user{" "}
                <span className="font-medium text-foreground">{deleteTarget?.username}</span>? This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</Button>
              <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                {deleting ? "Deleting…" : "Delete User"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
