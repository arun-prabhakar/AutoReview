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

function generateToken(user: { id: string; username: string; role: string }): string {
  return jwt.sign({ id: user.id, username: user.username, role: user.role }, getJwtSecret(), {
    expiresIn: JWT_EXPIRES_IN,
  });
}

// --- Public routes (authRouter) ---

authRouter.post("/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    res.status(400).json({ error: "Username and password required" });
    return;
  }

  const user = await get<{ id: string; username: string; password_hash: string; role: string; must_change_password: number }>(
    "SELECT id, username, password_hash, role, must_change_password FROM users WHERE username = ?",
    [username],
  );
  if (!user) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  if (!bcrypt.compareSync(password, user.password_hash)) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const token = generateToken(user);
  logger.audit("user_login", { userId: user.id, username: user.username, role: user.role });

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      must_change_password: !!user.must_change_password,
    },
  });
});

authRouter.get("/me", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  try {
    const payload = jwt.verify(authHeader.split(" ")[1], getJwtSecret()) as {
      id: string;
      username: string;
      role: string;
    };

    const user = await get<{ id: string; username: string; role: string; must_change_password: number }>(
      "SELECT id, username, role, must_change_password FROM users WHERE id = ?",
      [payload.id],
    );
    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }

    res.json({
      id: user.id,
      username: user.username,
      role: user.role,
      must_change_password: !!user.must_change_password,
    });
  } catch {
    res.status(401).json({ error: "Token expired or invalid" });
  }
});

// --- Change own password (any authenticated user) ---

authRouter.post("/change-password", jwtAuth, async (req, res) => {
  const { current_password, new_password } = req.body;

  if (!current_password || !new_password) {
    res.status(400).json({ error: "Current password and new password are required" });
    return;
  }

  if (new_password.length < 6) {
    res.status(400).json({ error: "New password must be at least 6 characters" });
    return;
  }

  const user = await get<{ id: string; password_hash: string; must_change_password: number }>(
    "SELECT id, password_hash, must_change_password FROM users WHERE id = ?",
    [req.user!.id],
  );
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (!bcrypt.compareSync(current_password, user.password_hash)) {
    res.status(401).json({ error: "Current password is incorrect" });
    return;
  }

  const hash = bcrypt.hashSync(new_password, 10);
  await run(
    "UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = datetime('now') WHERE id = ?",
    [hash, user.id],
  );

  logger.audit("password_changed", { userId: user.id });
  res.json({ message: "Password changed successfully" });
});

// --- Admin routes (usersRouter) ---

usersRouter.get("/", async (_req, res) => {
  const users = await all<{ id: string; username: string; role: string; must_change_password: number; created_at: string }>(
    "SELECT id, username, role, must_change_password, created_at FROM users ORDER BY created_at",
  );
  res.json(users);
});

usersRouter.post("/", async (req, res) => {
  const { username, password, role } = req.body;

  if (!username || !password) {
    res.status(400).json({ error: "Username and password required" });
    return;
  }

  if (!["admin", "user"].includes(role)) {
    res.status(400).json({ error: "Role must be 'admin' or 'user'" });
    return;
  }

  const existing = await get("SELECT id FROM users WHERE username = ?", [username]);
  if (existing) {
    res.status(409).json({ error: "Username already exists" });
    return;
  }

  const id = uuid();
  const hash = bcrypt.hashSync(password, 10);

  await run(
    "INSERT INTO users (id, username, password_hash, role, must_change_password) VALUES (?, ?, ?, ?, 1)",
    [id, username, hash, role],
  );

  logger.audit("user_created", { id, username, role });
  res.status(201).json({ id, username, role, must_change_password: true });
});

usersRouter.put("/:id/password", async (req, res) => {
  const { password } = req.body;
  const { id } = req.params;

  if (!password || password.length < 4) {
    res.status(400).json({ error: "Password must be at least 4 characters" });
    return;
  }

  const existing = await get("SELECT id FROM users WHERE id = ?", [id]);
  if (!existing) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const hash = bcrypt.hashSync(password, 10);
  await run(
    "UPDATE users SET password_hash = ?, must_change_password = 1, updated_at = datetime('now') WHERE id = ?",
    [hash, id],
  );

  logger.audit("password_reset_by_admin", { targetUserId: id, adminUserId: req.user?.id });
  res.json({ message: "Password reset. User must change it on next login." });
});

usersRouter.delete("/:id", async (req, res) => {
  const { id } = req.params;

  const existing = await get("SELECT id, role FROM users WHERE id = ?", [id]);
  if (!existing) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (existing.role === "admin") {
    const adminCount = await get<{ count: number }>("SELECT COUNT(*) as count FROM users WHERE role = 'admin'");
    if (adminCount && adminCount.count <= 1) {
      res.status(400).json({ error: "Cannot delete the last admin user" });
      return;
    }
  }

  await run("DELETE FROM users WHERE id = ?", [id]);
  logger.audit("user_deleted", { userId: id });
  res.json({ message: "User deleted" });
});
