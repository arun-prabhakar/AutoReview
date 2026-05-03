import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuid } from "uuid";
import { getDb } from "../db/index.js";
import { logger } from "../middleware/index.js";

export const authRouter = Router();

const JWT_SECRET = process.env.JWT_SECRET || "autoreview-jwt-secret-change-in-prod";
const JWT_EXPIRES_IN = "24h";

function generateToken(user: { id: string; username: string; role: string }): string {
  return jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
}

authRouter.post("/login", async (req, res) => {
  const db = await getDb();
  const { username, password } = req.body;

  if (!username || !password) {
    res.status(400).json({ error: "Username and password required" });
    return;
  }

  const result = db.exec("SELECT id, username, password_hash, role FROM users WHERE username = ?", [username]);
  const row = result[0]?.values?.[0];
  if (!row) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const user = { id: row[0] as string, username: row[1] as string, password_hash: row[2] as string, role: row[3] as string };

  if (!bcrypt.compareSync(password, user.password_hash)) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const token = generateToken(user);
  logger.audit("user_login", { userId: user.id, username: user.username, role: user.role });

  res.json({
    token,
    user: { id: user.id, username: user.username, role: user.role },
  });
});

authRouter.get("/me", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  try {
    const payload = jwt.verify(authHeader.split(" ")[1], JWT_SECRET) as {
      id: string;
      username: string;
      role: string;
    };
    res.json({ id: payload.id, username: payload.username, role: payload.role });
  } catch {
    res.status(401).json({ error: "Token expired or invalid" });
  }
});

authRouter.get("/users", async (req, res) => {
  const db = await getDb();
  const result = db.exec("SELECT id, username, role, created_at FROM users ORDER BY created_at");
  const columns = result[0]?.columns || [];
  const rows = result[0]?.values || [];

  const users = rows.map((row) => ({
    id: row[0],
    username: row[1],
    role: row[2],
    created_at: row[3],
  }));

  res.json(users);
});

authRouter.post("/users", async (req, res) => {
  const db = await getDb();
  const { username, password, role } = req.body;

  if (!username || !password) {
    res.status(400).json({ error: "Username and password required" });
    return;
  }

  if (!["admin", "user"].includes(role)) {
    res.status(400).json({ error: "Role must be 'admin' or 'user'" });
    return;
  }

  const existing = db.exec("SELECT id FROM users WHERE username = ?", [username]);
  if (existing[0]?.values?.length) {
    res.status(409).json({ error: "Username already exists" });
    return;
  }

  const id = uuid();
  const hash = bcrypt.hashSync(password, 10);

  db.run("INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)", [id, username, hash, role]);

  logger.audit("user_created", { id, username, role });
  res.status(201).json({ id, username, role });
});

authRouter.put("/users/:id/password", async (req, res) => {
  const db = await getDb();
  const { password } = req.body;
  const { id } = req.params;

  if (!password || password.length < 4) {
    res.status(400).json({ error: "Password must be at least 4 characters" });
    return;
  }

  const existing = db.exec("SELECT id FROM users WHERE id = ?", [id]);
  if (!existing[0]?.values?.length) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const hash = bcrypt.hashSync(password, 10);
  db.run("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?", [hash, id]);

  logger.audit("password_changed", { userId: id });
  res.json({ message: "Password updated" });
});

authRouter.delete("/users/:id", async (req, res) => {
  const db = await getDb();
  const { id } = req.params;

  const existing = db.exec("SELECT id, role FROM users WHERE id = ?", [id]);
  if (!existing[0]?.values?.length) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  db.run("DELETE FROM users WHERE id = ?", [id]);
  logger.audit("user_deleted", { userId: id });
  res.json({ message: "User deleted" });
});
