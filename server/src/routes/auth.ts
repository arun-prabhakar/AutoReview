import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuid } from "uuid";
import { get, all, run } from "../db/queries.js";
import { logger } from "../middleware/index.js";
import { getJwtSecret } from "../config.js";
import { jwtAuth } from "../middleware/jwt-auth.js";

export const authRouter = Router();
export const usersRouter = Router();

const JWT_EXPIRES_IN = "24h";
const COOKIE_MAX_AGE = 24 * 60 * 60 * 1000;
const MIN_PASSWORD_LENGTH = 8;

function generateToken(user: { id: string; username: string; role: string; tokenVersion?: number }): string {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role, tokenVersion: user.tokenVersion ?? 0 },
    getJwtSecret(),
    { expiresIn: JWT_EXPIRES_IN }
  );
}

authRouter.post("/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    res.status(400).json({ error: "Username and password required" });
    return;
  }

  const user = await get<{ id: string; username: string; name: string | null; password_hash: string; role: string; must_change_password: boolean; token_version: number }>(
    "SELECT id, username, name, password_hash, role, must_change_password, token_version FROM users WHERE username = $1",
    [username],
  );
  if (!user) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const token = generateToken(user);
  logger.audit("user_login", { userId: user.id, username: user.username, role: user.role });

  res.cookie("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/api",
  });

  res.json({
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      must_change_password: !!user.must_change_password,
    },
  });
});

authRouter.get("/me", async (req, res) => {
  const authHeader = req.headers.authorization;
  const cookieToken = req.cookies?.token;
  const token = (authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : null) || cookieToken;

  if (!token) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  try {
    const payload = jwt.verify(token, getJwtSecret()) as {
      id: string;
      username: string;
      role: string;
      tokenVersion?: number;
    };

    const user = await get<{ id: string; username: string; name: string | null; role: string; must_change_password: boolean; token_version: number }>(
      "SELECT id, username, name, role, must_change_password, token_version FROM users WHERE id = $1",
      [payload.id],
    );
    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }

    if (payload.tokenVersion !== undefined && payload.tokenVersion !== user.token_version) {
      res.clearCookie("token", { path: "/api" });
      res.status(401).json({ error: "Token revoked" });
      return;
    }

    res.json({
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      must_change_password: !!user.must_change_password,
    });
  } catch {
    res.status(401).json({ error: "Token expired or invalid" });
  }
});

authRouter.post("/logout", (_req, res) => {
  res.clearCookie("token", { path: "/api" });
  res.json({ message: "Logged out" });
});

authRouter.post("/change-password", jwtAuth, async (req, res) => {
  const { current_password, new_password } = req.body;

  if (!current_password || !new_password) {
    res.status(400).json({ error: "Current password and new password are required" });
    return;
  }

  if (new_password.length < MIN_PASSWORD_LENGTH) {
    res.status(400).json({ error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    return;
  }

  const user = await get<{ id: string; password_hash: string; must_change_password: boolean }>(
    "SELECT id, password_hash, must_change_password FROM users WHERE id = $1",
    [req.user!.id],
  );
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const match = await bcrypt.compare(current_password, user.password_hash);
  if (!match) {
    res.status(401).json({ error: "Current password is incorrect" });
    return;
  }

  const hash = await bcrypt.hash(new_password, 10);
  await run(
    "UPDATE users SET password_hash = $1, must_change_password = false, token_version = token_version + 1, updated_at = NOW() WHERE id = $2",
    [hash, user.id],
  );

  logger.audit("password_changed", { userId: user.id });
  res.json({ message: "Password changed successfully" });
});

usersRouter.get("/", async (_req, res) => {
  const users = await all<{ id: string; username: string; name: string | null; role: string; must_change_password: boolean; created_at: string }>(
    "SELECT id, username, name, role, must_change_password, created_at FROM users ORDER BY created_at",
  );
  res.json(users);
});

usersRouter.post("/", async (req, res) => {
  const { username, password, role, name } = req.body;

  if (!username || !password) {
    res.status(400).json({ error: "Username and password required" });
    return;
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    return;
  }

  if (!["admin", "user"].includes(role)) {
    res.status(400).json({ error: "Role must be 'admin' or 'user'" });
    return;
  }

  const existing = await get("SELECT id FROM users WHERE username = $1", [username]);
  if (existing) {
    res.status(409).json({ error: "Username already exists" });
    return;
  }

  const id = uuid();
  const hash = await bcrypt.hash(password, 10);

  await run(
    "INSERT INTO users (id, username, name, password_hash, role, must_change_password) VALUES ($1, $2, $3, $4, $5, true)",
    [id, username, name || null, hash, role],
  );

  logger.audit("user_created", { id, username, role });
  res.status(201).json({ id, username, name: name || null, role, must_change_password: true });
});

usersRouter.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { username, name, role } = req.body;

  const existing = await get("SELECT id FROM users WHERE id = $1", [id]);
  if (!existing) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (username !== undefined) {
    if (!username || username.trim().length === 0) {
      res.status(400).json({ error: "Username cannot be empty" });
      return;
    }
    const duplicate = await get("SELECT id FROM users WHERE username = $1 AND id != $2", [username.trim(), id]);
    if (duplicate) {
      res.status(409).json({ error: "Username already exists" });
      return;
    }
  }

  if (role !== undefined && (!role || !["admin", "user"].includes(role))) {
    res.status(400).json({ error: "Role must be 'admin' or 'user'" });
    return;
  }

  const sets: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (username !== undefined) {
    sets.push(`username = $${idx++}`);
    params.push(username.trim());
  }
  if (name !== undefined) {
    sets.push(`name = $${idx++}`);
    params.push(name || null);
  }
  if (role !== undefined) {
    sets.push(`role = $${idx++}`);
    params.push(role);
  }

  if (sets.length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  sets.push(`updated_at = NOW()`);
  params.push(id);

  await run(`UPDATE users SET ${sets.join(", ")} WHERE id = $${idx}`, params);

  const user = await get<{ id: string; username: string; name: string | null; role: string; must_change_password: boolean; created_at: string }>(
    "SELECT id, username, name, role, must_change_password, created_at FROM users WHERE id = $1",
    [id],
  );

  logger.audit("user_updated", { targetUserId: id, updates: { username, name, role } });
  res.json(user);
});

usersRouter.put("/:id/password", async (req, res) => {
  const { password } = req.body;
  const { id } = req.params;

  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    return;
  }

  const existing = await get("SELECT id FROM users WHERE id = $1", [id]);
  if (!existing) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const hash = await bcrypt.hash(password, 10);
  await run(
    "UPDATE users SET password_hash = $1, must_change_password = true, token_version = token_version + 1, updated_at = NOW() WHERE id = $2",
    [hash, id],
  );

  logger.audit("password_reset_by_admin", { targetUserId: id, adminUserId: req.user?.id });
  res.json({ message: "Password reset. User must change it on next login." });
});

usersRouter.delete("/:id", async (req, res) => {
  const { id } = req.params;

  const existing = await get("SELECT id, role FROM users WHERE id = $1", [id]);
  if (!existing) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (existing.role === "admin") {
    const adminCount = await get<{ count: string }>("SELECT COUNT(*) as count FROM users WHERE role = 'admin'");
    if (adminCount && Number(adminCount.count) <= 1) {
      res.status(400).json({ error: "Cannot delete the last admin user" });
      return;
    }
  }

  await run("DELETE FROM users WHERE id = $1", [id]);
  logger.audit("user_deleted", { userId: id });
  res.json({ message: "User deleted" });
});
