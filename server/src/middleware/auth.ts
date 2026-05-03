import type { Request, Response, NextFunction } from "express";

export function basicAuth(username: string, password: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!username || !password) {
      next();
      return;
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Basic ")) {
      res.setHeader("WWW-Authenticate", 'Basic realm="AutoReview"');
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const credentials = Buffer.from(authHeader.split(" ")[1], "base64").toString();
    const [user, pass] = credentials.split(":");

    if (user !== username || pass !== password) {
      res.setHeader("WWW-Authenticate", 'Basic realm="AutoReview"');
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    next();
  };
}
