import fs from "fs";
import path from "path";
import type { Request, Response, NextFunction } from "express";

const LOG_DIR = process.env.LOG_DIR || path.join(process.cwd(), "logs");
const LOG_FILE = path.join(LOG_DIR, "autoreview.log");

function writeToFile(message: string): void {
  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
    fs.promises.appendFile(LOG_FILE, message + "\n").catch(() => {});
  } catch {
    // Silent fail — don't crash on log errors
  }
}

function log(level: string, message: string, meta?: unknown): void {
  const timestamp = new Date().toISOString();
  const line = meta
    ? `[${timestamp}] [${level}] ${message} ${JSON.stringify(meta)}`
    : `[${timestamp}] [${level}] ${message}`;

  if (level === "ERROR") {
    process.stderr.write(line + "\n");
  } else {
    process.stdout.write(line + "\n");
  }
  writeToFile(line);
}

export const logger = {
  info: (message: string, meta?: Record<string, unknown>) => log("INFO", message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => log("WARN", message, meta),
  error: (message: string, meta?: Record<string, unknown>) => log("ERROR", message, meta),
  audit: (action: string, details: Record<string, unknown>) => log("AUDIT", action, details),
};

export function requestLogger(req: Request, _res: Response, next: NextFunction): void {
  const start = Date.now();

  _res.on("finish", () => {
    const duration = Date.now() - start;
    logger.info(`${req.method} ${req.originalUrl} ${_res.statusCode} ${duration}ms`);
  });

  next();
}

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  logger.error(err.message, { stack: err.stack });
  const message = process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : err.message;
  res.status(500).json({ error: message });
}
