import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import request from "supertest";
import { authRouter, usersRouter } from "../routes/auth.js";
import { initDb, getDb } from "../db/index.js";
import { getJwtSecret } from "../config.js";
import jwt from "jsonwebtoken";
import fs from "fs";
import path from "path";
import os from "os";
let adminToken: string;
let adminUserId: string;
let testDbPath: string;

describe("auth routes", () => {
  let app: express.Express;

  beforeAll(async () => {
    process.env.ENCRYPTION_KEY = "test-encryption-key";
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "autoreview-test-"));
    testDbPath = path.join(tmpDir, "test.db");
    process.env.DB_PATH = testDbPath;
    process.env.LOG_DIR = tmpDir;

    await initDb();

    const db = await getDb();
    const result = db.exec("SELECT id FROM users WHERE username = 'admin'");
    adminUserId = result[0]?.values?.[0]?.[0] as string;

    adminToken = jwt.sign({ id: adminUserId, username: "admin", role: "admin" }, getJwtSecret(), { expiresIn: "1h" });

    app = express();
    app.use(express.json());
    app.use("/api/auth", authRouter);
    app.use("/api/auth/users", usersRouter);
  });

  afterAll(() => {
    const dir = path.dirname(testDbPath);
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  describe("POST /api/auth/login", () => {
    it("should login with valid admin credentials", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ username: "admin", password: "admin" });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.username).toBe("admin");
      expect(res.body.user.role).toBe("admin");
    });

    it("should return 400 for missing fields", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Username and password required");
    });

    it("should return 401 for wrong password", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ username: "admin", password: "wrong" });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe("Invalid credentials");
    });

    it("should return 401 for nonexistent user", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ username: "nobody", password: "test" });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe("Invalid credentials");
    });
  });

  describe("GET /api/auth/me", () => {
    it("should return user info for valid token", async () => {
      const res = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.username).toBe("admin");
      expect(res.body.role).toBe("admin");
    });

    it("should return 401 without token", async () => {
      const res = await request(app)
        .get("/api/auth/me");

      expect(res.status).toBe(401);
    });

    it("should return 401 for invalid token", async () => {
      const res = await request(app)
        .get("/api/auth/me")
        .set("Authorization", "Bearer invalid-token");

      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/auth/users", () => {
    it("should create a new user", async () => {
      const res = await request(app)
        .post("/api/auth/users")
        .send({ username: "testuser", password: "testpass", role: "user" });

      expect(res.status).toBe(201);
      expect(res.body.username).toBe("testuser");
      expect(res.body.role).toBe("user");
      expect(res.body.id).toBeDefined();
    });

    it("should return 409 for duplicate username", async () => {
      await request(app)
        .post("/api/auth/users")
        .send({ username: "duplicate", password: "pass1", role: "user" });

      const res = await request(app)
        .post("/api/auth/users")
        .send({ username: "duplicate", password: "pass2", role: "user" });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe("Username already exists");
    });

    it("should return 400 for missing fields", async () => {
      const res = await request(app)
        .post("/api/auth/users")
        .send({ username: "incomplete" });

      expect(res.status).toBe(400);
    });

    it("should return 400 for invalid role", async () => {
      const res = await request(app)
        .post("/api/auth/users")
        .send({ username: "badrole", password: "pass", role: "superadmin" });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Role must be");
    });
  });

  describe("PUT /api/auth/users/:id/password", () => {
    it("should update password", async () => {
      const createRes = await request(app)
        .post("/api/auth/users")
        .send({ username: "pwuser", password: "oldpass", role: "user" });

      const userId = createRes.body.id;

      const res = await request(app)
        .put(`/api/auth/users/${userId}/password`)
        .send({ password: "newpass123" });

      expect(res.status).toBe(200);

      const loginRes = await request(app)
        .post("/api/auth/login")
        .send({ username: "pwuser", password: "newpass123" });

      expect(loginRes.status).toBe(200);
    });

    it("should return 400 for short password", async () => {
      const res = await request(app)
        .put(`/api/auth/users/${adminUserId}/password`)
        .send({ password: "ab" });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("at least 4 characters");
    });

    it("should return 404 for nonexistent user", async () => {
      const res = await request(app)
        .put("/api/auth/users/nonexistent-id/password")
        .send({ password: "newpass123" });

      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /api/auth/users/:id", () => {
    it("should delete a user", async () => {
      const createRes = await request(app)
        .post("/api/auth/users")
        .send({ username: "deleteuser", password: "pass", role: "user" });

      const userId = createRes.body.id;

      const res = await request(app)
        .delete(`/api/auth/users/${userId}`);

      expect(res.status).toBe(200);

      const loginRes = await request(app)
        .post("/api/auth/login")
        .send({ username: "deleteuser", password: "pass" });

      expect(loginRes.status).toBe(401);
    });

    it("should return 404 for nonexistent user", async () => {
      const res = await request(app)
        .delete("/api/auth/users/nonexistent-id");

      expect(res.status).toBe(404);
    });
  });
});
