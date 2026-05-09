import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ChangePasswordFormProps {
  onSubmit: (currentPassword: string, newPassword: string) => Promise<void>;
  loading: boolean;
  error: string;
  showCurrentPassword?: boolean;
}

export function ChangePasswordForm({ onSubmit, loading, error, showCurrentPassword = true }: ChangePasswordFormProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [validationError, setValidationError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setValidationError("");
    if (newPassword.length < 6) { setValidationError("New password must be at least 6 characters"); return; }
    if (newPassword !== confirmPassword) { setValidationError("New passwords do not match"); return; }
    await onSubmit(currentPassword, newPassword);
  }

  const displayError = validationError || error;

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-4">
      {displayError && (
        <div className="rounded-md bg-secondary px-3 py-2 text-sm text-destructive">{displayError}</div>
      )}

      {showCurrentPassword && (
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
      )}

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
  );
}
