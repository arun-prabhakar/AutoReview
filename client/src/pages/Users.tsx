import { useEffect, useState } from "react";
import { api } from "@/services/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2 } from "lucide-react";
import { BlurFade } from "@/components/ui/blur-fade";
import { BorderBeam } from "@/components/ui/border-beam";

type User = { id: string; username: string; role: string; must_change_password: number; created_at: string };

export default function Users() {
  const { toast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [autoGenPassword, setAutoGenPassword] = useState(true);
  const [manualPassword, setManualPassword] = useState("");
  const [createdPassword, setCreatedPassword] = useState<string | null>(null);
  const [resetPasswordUser, setResetPasswordUser] = useState<User | null>(null);

  useEffect(() => { loadUsers(); }, []);

  const loadUsers = async () => {
    try {
      const data = await api.get<User[]>("/api/auth/users");
      setUsers(data);
    } catch {}
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
    if (!password || password.length < 4) {
      toast({ title: "Error", description: "Password must be at least 4 characters", variant: "destructive" });
      return;
    }
    try {
      await api.post("/api/auth/users", { username: fd.get("username"), password, role: fd.get("role") });
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
      toast({ title: "Password reset" });
      setResetPasswordUser(null);
      loadUsers();
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to reset password", variant: "destructive" });
    }
  };

  const handleDeleteUser = async (id: string) => {
    try {
      await api.del(`/api/auth/users/${id}`);
      toast({ title: "User deleted" });
      loadUsers();
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to delete user", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <BlurFade delay={0.05} duration={0.35} inView>
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold tracking-tight">Users</h2>
          <Dialog open={userDialogOpen} onOpenChange={(o) => { setUserDialogOpen(o); if (o) { setAutoGenPassword(true); setManualPassword(""); } }}>
            <DialogTrigger asChild><Button size="sm"><Plus className="mr-2 h-4 w-4" />Add User</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add User</DialogTitle></DialogHeader>
              <form onSubmit={handleAddUser} className="space-y-4">
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
      </BlurFade>

      <BlurFade delay={0.1} duration={0.4} inView>
        <div className="space-y-4">
          {users.map((u) => (
            <Card key={u.id} className="relative overflow-hidden">
              <BorderBeam size={40} duration={8} colorFrom="#e5e5e5" colorTo="#e5e5e51a" borderWidth={1} />
              <CardContent className="flex items-center justify-between pt-6">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{u.username}</p>
                    <Badge variant={u.role === "admin" ? "default" : "secondary"}>{u.role}</Badge>
                    {!!u.must_change_password && <Badge variant="outline" className="text-amber-500 border-amber-500">Must change password</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">Created {new Date(u.created_at).toLocaleDateString()}</p>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setResetPasswordUser(u)}>Reset Password</Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDeleteUser(u.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {users.length === 0 && <p className="py-8 text-center text-muted-foreground">No users found</p>}
        </div>
      </BlurFade>

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
              <Button variant="ghost" size="sm" className="shrink-0" onClick={() => { navigator.clipboard.writeText(createdPassword || ""); toast({ title: "Copied" }); }}>Copy</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
