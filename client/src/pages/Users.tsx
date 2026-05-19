import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { api } from "@/services/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Pencil } from "lucide-react";
import { validateSession } from "@/store/authSlice";
import type { RootState, AppDispatch } from "@/store";

type User = { id: string; username: string; name: string | null; role: string; must_change_password: number; created_at: string };

export default function Users() {
  const { toast } = useToast();
  const dispatch = useDispatch<AppDispatch>();
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [autoGenPassword, setAutoGenPassword] = useState(true);
  const [manualPassword, setManualPassword] = useState("");
  const [createdPassword, setCreatedPassword] = useState<string | null>(null);
  const [resetPasswordUser, setResetPasswordUser] = useState<User | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editTarget, setEditTarget] = useState<User | null>(null);
  const [editRole, setEditRole] = useState<string>("user");
  const [editUsername, setEditUsername] = useState<string>("");
  const [editName, setEditName] = useState<string>("");

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
    if (!password || password.length < 8) {
      toast({ title: "Error", description: "Password must be at least 4 characters", variant: "destructive" });
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
    const fd = new FormData(e.currentTarget);
    try {
      await api.put(`/api/auth/users/${resetPasswordUser.id}/password`, { password: fd.get("password") });
      toast({ title: "Password reset", variant: "success" });
      setResetPasswordUser(null);
      loadUsers();
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to reset password", variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
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

  return (
    <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold tracking-tight">Users</h2>
          <Dialog open={userDialogOpen} onOpenChange={(o) => { setUserDialogOpen(o); if (o) { setAutoGenPassword(true); setManualPassword(""); } }}>
            <DialogTrigger asChild><Button size="sm"><Plus className="mr-2 h-4 w-4" />Add User</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add User</DialogTitle></DialogHeader>
              <form onSubmit={handleAddUser} className="space-y-4">
                <div className="space-y-2"><Label>Name</Label><Input name="name" placeholder="Display name (optional)" /></div>
                <div className="space-y-2"><Label>Username</Label><Input name="username" required /></div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Password</Label>
                    <Button type="button" variant="ghost" size="sm" className="text-xs h-6" onClick={() => setAutoGenPassword(!autoGenPassword)}>
                      {autoGenPassword ? "Enter manually" : "Auto-generate"}
                    </Button>
                  </div>
                  {autoGenPassword ? (
                    <p className="text-sm text-muted-foreground">A secure password will be generated automatically.</p>
                  ) : (
                    <Input type="password" value={manualPassword} onChange={(e) => setManualPassword(e.target.value)} required minLength={4} placeholder="Min 4 characters" />
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select name="role" defaultValue="user">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">User</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" className="w-full">Create User</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="space-y-4">
          {users.map((u) => (
            <Card key={u.id}>
              <CardContent className="flex items-center justify-between pt-6">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{u.name || u.username}</p>
                    {u.name && <span className="text-sm text-muted-foreground">@{u.username}</span>}
                    <Badge variant={u.role === "admin" ? "default" : "secondary"}>{u.role}</Badge>
                    {!!u.must_change_password && <Badge variant="outline" className="text-warning border-warning">Must change password</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">Created {new Date(u.created_at).toLocaleDateString()}</p>
                </div>
                <div className="flex items-center gap-1">
                   <Button variant="ghost" size="icon" aria-label="Edit user" onClick={() => { setEditTarget(u); setEditUsername(u.username); setEditName(u.name || ""); setEditRole(u.role); }}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="sm" onClick={() => setResetPasswordUser(u)}>Reset Password</Button>
                  <Button variant="ghost" size="icon" aria-label="Delete user" onClick={() => setDeleteTarget(u)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {loadingUsers && <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-20 rounded-lg bg-secondary animate-pulse" />)}</div>}
{!loadingUsers && users.length === 0 && <p className="py-8 text-center text-muted-foreground">No users found</p>}
        </div>

      <Dialog open={!!resetPasswordUser} onOpenChange={(o) => !o && setResetPasswordUser(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reset Password for {resetPasswordUser?.username}</DialogTitle></DialogHeader>
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="space-y-2"><Label>New Password</Label><Input name="password" type="password" required /></div>
            <Button type="submit" className="w-full">Reset Password</Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!createdPassword} onOpenChange={(o) => !o && setCreatedPassword(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>User Created</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Share this password with the user. They will be asked to change it on first login.</p>
            <div className="flex items-center gap-2 rounded-md bg-secondary p-3">
              <code className="flex-1 text-sm font-mono break-all">{createdPassword}</code>
              <Button variant="ghost" size="sm" className="shrink-0" onClick={() => { navigator.clipboard.writeText(createdPassword || ""); toast({ title: "Copied", variant: "success" }); }}>Copy</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editTarget} onOpenChange={(open) => { if (!open) setEditTarget(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit User</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Display name" />
            </div>
            <div className="space-y-2">
              <Label>Username</Label>
              <Input value={editUsername} onChange={(e) => setEditUsername(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={editRole} onValueChange={setEditRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
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
  );
}
