import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import request from "supertest";
import { authRouter, usersRouter } from "../routes/auth.js";
import { getJwtSecret } from "../config.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { v4 as uuid } from "uuid";

vi.mock("../db/index.js", () => ({
  getPool: () => ({
    query: vi.fn(),
  }),
  initDb: vi.fn(),
  closePool: vi.fn(),
}));

const TEST_PASSWORD = "testpassword123";
const ADMIN_PASSWORD = "adminpassword";

let adminToken: string;
let adminUserId: string;
let mockUsers: Array<{ id: string; username: string; password_hash: string; role: string; must_change_password: boolean; token_version: number; created_at: string }>;

function resetMockData() {
  adminUserId = uuid();
  const adminHash = bcrypt.hashSync(ADMIN_PASSWORD, 10);
  mockUsers = [
    { id: adminUserId, username: "admin", password_hash: adminHash, role: "admin", must_change_password: false, token_version: 0, created_at: new Date().toISOString() },
  ];

  adminToken = jwt.sign({ id: adminUserId, username: "admin", role: "admin", tokenVersion: 0 }, getJwtSecret(), { expiresIn: "1h" });
}

import { getPool } from "../db/index.js";
const mockedPool = getPool() as unknown as { query: ReturnType<typeof vi.fn> };

function mockQueryImpl(sql: string, params: unknown[]) {
  const sqlLower = sql.trim().toLowerCase();

  if (sqlLower.startsWith("select")) {
    if (sqlLower.includes("from users") && sqlLower.includes("where username")) {
      const user = mockUsers.find(u => u.username === params[0]);
      const cols = sqlLower.includes("password_hash") ? ["id", "username", "password_hash", "role", "must_change_password", "token_version"] : ["id"];
      return { rows: user ? [cols.reduce((obj, col) => ({ ...obj, [col]: (user as Record<string, unknown>)[col] }), {})] : [] };
    }
    if (sqlLower.includes("from users") && sqlLower.includes("where id")) {
      const uid = params[0] as string;
      const user = mockUsers.find(u => u.id === uid);
      if (sqlLower.includes("password_hash")) {
        const cols = ["id", "username", "password_hash", "role", "must_change_password", "token_version"];
        return { rows: user ? [cols.reduce((obj, col) => ({ ...obj, [col]: (user as Record<string, unknown>)[col] }), {})] : [] };
      }
      if (sqlLower.includes("must_change_password")) {
        return { rows: user ? [{ id: user.id, username: user.username, role: user.role, must_change_password: user.must_change_password, created_at: user.created_at }] : [] };
      }
      if (sqlLower.includes("role")) {
        return { rows: user ? [{ id: user.id, role: user.role }] : [] };
      }
      return { rows: user ? [{ id: user.id }] : [] };
    }
    if (sqlLower.includes("count") && sqlLower.includes("role = 'admin'")) {
      return { rows: [{ count: String(mockUsers.filter(u => u.role === "admin").length) }] };
    }
    if (sqlLower.includes("from users") && sqlLower.includes("order by created_at")) {
      return { rows: mockUsers.map(u => ({ id: u.id, username: u.username, role: u.role, must_change_password: u.must_change_password, created_at: u.created_at })) };
    }
    if (sqlLower.includes("from users")) {
      return { rows: [] };
    }
  }

  if (sqlLower.startsWith("insert into users")) {
    const newId = params[0] as string;
    const newUsername = params[1] as string;
    const newHash = params[2] as string;
    const newRole = params[3] as string;
    mockUsers.push({ id: newId, username: newUsername, password_hash: newHash, role: newRole, must_change_password: true, token_version: 0, created_at: new Date().toISOString() });
    return { rows: [] };
  }

  if (sqlLower.startsWith("update users")) {
    if (sqlLower.includes("password_hash")) {
      const uid = params[params.length - 1] as string;
      const user = mockUsers.find(u => u.id === uid);
      if (user) {
        user.password_hash = params[0] as string;
        if (sqlLower.includes("must_change_password = true")) {
          user.must_change_password = true;
        } else if (sqlLower.includes("must_change_password = false")) {
          user.must_change_password = false;
        }
        user.token_version += 1;
      }
    } else if (sqlLower.includes("role")) {
      const uid = params[1] as string;
      const user = mockUsers.find(u => u.id === uid);
      if (user) {
        user.role = params[0] as string;
      }
    }
    return { rows: [] };
  }

  if (sqlLower.startsWith("delete from users")) {
    const uid = params[0] as string;
    mockUsers = mockUsers.filter(u => u.id !== uid);
    return { rows: [] };
  }

  return { rows: [] };
}

describe("auth routes", () => {
  let app: express.Express;

  beforeAll(async () => {
    process.env.ENCRYPTION_KEY = "test-encryption-key-32-characters!";
    process.env.JWT_SECRET = "test-jwt-secret-for-tests";
    process.env.DATABASE_URL = "postgresql://mock:mock@localhost:5432/mock";
    process.env.LOG_DIR = "/tmp/autoreview-test-logs";

    resetMockData();

    mockedPool.query.mockImplementation(mockQueryImpl);

    app = express();
    app.use(express.json());
    app.use("/api/auth", authRouter);
    app.use("/api/auth/users", usersRouter);
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  describe("POST /api/auth/login", () => {
    it("should login with valid admin credentials", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ username: "admin", password: ADMIN_PASSWORD });

      expect(res.status).toBe(200);
      expect(res.body.user.username).toBe("admin");
      expect(res.body.user.role).toBe("admin");
      const cookies = res.headers["set-cookie"] as unknown as string[] | undefined;
      expect(cookies?.some((c: string) => c.startsWith("token="))).toBe(true);
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
        .send({ username: "admin", password: "wrongpassword123" });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe("Invalid credentials");
    });

    it("should return 401 for nonexistent user", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ username: "nobody", password: TEST_PASSWORD });

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
        .send({ username: "testuser", password: TEST_PASSWORD, role: "user" });

      expect(res.status).toBe(201);
      expect(res.body.username).toBe("testuser");
      expect(res.body.role).toBe("user");
      expect(res.body.id).toBeDefined();
    });

    it("should return 409 for duplicate username", async () => {
      await request(app)
        .post("/api/auth/users")
        .send({ username: "duplicate", password: TEST_PASSWORD, role: "user" });

      const res = await request(app)
        .post("/api/auth/users")
        .send({ username: "duplicate", password: TEST_PASSWORD + "2", role: "user" });

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
        .send({ username: "badrole", password: TEST_PASSWORD, role: "superadmin" });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Role must be");
    });
  });

  describe("PUT /api/auth/users/:id/password", () => {
    it("should update password", async () => {
      const createRes = await request(app)
        .post("/api/auth/users")
        .send({ username: "pwuser", password: TEST_PASSWORD, role: "user" });

      const userId = createRes.body.id;

      const newPassword = "brand-new-password-456";
      const res = await request(app)
        .put(`/api/auth/users/${userId}/password`)
        .send({ password: newPassword });

      expect(res.status).toBe(200);

      const loginRes = await request(app)
        .post("/api/auth/login")
        .send({ username: "pwuser", password: newPassword });

      expect(loginRes.status).toBe(200);
    });

    it("should return 400 for short password", async () => {
      const res = await request(app)
        .put(`/api/auth/users/${adminUserId}/password`)
        .send({ password: "ab" });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("at least 8 characters");
    });

    it("should return 404 for nonexistent user", async () => {
      const res = await request(app)
        .put("/api/auth/users/nonexistent-id/password")
        .send({ password: TEST_PASSWORD });

      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /api/auth/users/:id", () => {
    it("should delete a user", async () => {
      const createRes = await request(app)
        .post("/api/auth/users")
        .send({ username: "deleteuser", password: TEST_PASSWORD, role: "user" });

      const userId = createRes.body.id;

      const res = await request(app)
        .delete(`/api/auth/users/${userId}`);

      expect(res.status).toBe(200);

      const loginRes = await request(app)
        .post("/api/auth/login")
        .send({ username: "deleteuser", password: TEST_PASSWORD });

      expect(loginRes.status).toBe(401);
    });

    it("should return 404 for nonexistent user", async () => {
      const res = await request(app)
        .delete("/api/auth/users/nonexistent-id");

      expect(res.status).toBe(404);
    });
  });
});
