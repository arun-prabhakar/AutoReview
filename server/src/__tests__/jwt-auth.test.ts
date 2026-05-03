import { describe, it, expect, vi } from "vitest";
import jwt from "jsonwebtoken";
import { jwtAuth, requireRole } from "../middleware/jwt-auth.js";
import type { Request, Response, NextFunction } from "express";

const JWT_SECRET = process.env.JWT_SECRET || "autoreview-jwt-secret-change-in-prod";

function mockRes(): Response {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

function mockNext(): NextFunction {
  return vi.fn();
}

describe("jwtAuth", () => {
  it("should set req.user for valid token", () => {
    const token = jwt.sign({ id: "1", username: "admin", role: "admin" }, JWT_SECRET);
    const req = { headers: { authorization: `Bearer ${token}` } } as Partial<Request> as Request;
    const res = mockRes();
    const next = mockNext();

    jwtAuth(req, res, next);

    expect(req.user).toEqual({ id: "1", username: "admin", role: "admin" });
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("should return 401 for missing authorization header", () => {
    const req = { headers: {} } as Partial<Request> as Request;
    const res = mockRes();
    const next = mockNext();

    jwtAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Authentication required" });
    expect(next).not.toHaveBeenCalled();
  });

  it("should return 401 for malformed authorization header", () => {
    const req = { headers: { authorization: "Basic abc" } } as Partial<Request> as Request;
    const res = mockRes();
    const next = mockNext();

    jwtAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("should return 401 for expired token", () => {
    const token = jwt.sign({ id: "1", username: "admin", role: "admin" }, JWT_SECRET, { expiresIn: "-1s" });
    const req = { headers: { authorization: `Bearer ${token}` } } as Partial<Request> as Request;
    const res = mockRes();
    const next = mockNext();

    jwtAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Token expired or invalid" });
  });

  it("should return 401 for wrong secret", () => {
    const token = jwt.sign({ id: "1", username: "admin", role: "admin" }, "wrong-secret");
    const req = { headers: { authorization: `Bearer ${token}` } } as Partial<Request> as Request;
    const res = mockRes();
    const next = mockNext();

    jwtAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
  });
});

describe("requireRole", () => {
  it("should call next for matching role", () => {
    const req = { user: { id: "1", username: "admin", role: "admin" } } as Partial<Request> as Request;
    const res = mockRes();
    const next = mockNext();

    requireRole("admin")(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("should return 401 if no user on request", () => {
    const req = {} as Partial<Request> as Request;
    const res = mockRes();
    const next = mockNext();

    requireRole("admin")(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("should return 403 for insufficient role", () => {
    const req = { user: { id: "2", username: "viewer", role: "user" } } as Partial<Request> as Request;
    const res = mockRes();
    const next = mockNext();

    requireRole("admin")(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "Insufficient permissions" });
  });

  it("should allow multiple roles", () => {
    const req = { user: { id: "2", username: "viewer", role: "user" } } as Partial<Request> as Request;
    const res = mockRes();
    const next = mockNext();

    requireRole("admin", "user")(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});
