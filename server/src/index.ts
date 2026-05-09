import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import rateLimit from "express-rate-limit";
import { initDb } from "./db/index.js";
import { reviewsRouter } from "./routes/reviews.js";
import { repositoriesRouter } from "./routes/repositories.js";
import { settingsRouter } from "./routes/settings.js";
import { credentialsRouter } from "./routes/credentials.js";
import { promptTemplateRouter } from "./routes/prompt-templates.js";
import { providersRouter } from "./routes/providers.js";
import { authRouter, usersRouter } from "./routes/auth.js";
import { requestLogger, errorHandler, logger } from "./middleware/index.js";
import { jwtAuth, requireRole } from "./middleware/jwt-auth.js";
import { startAutoReviewPolling, stopAutoReviewPolling } from "./services/automatic-review-service.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const STATIC_DIR = process.env.STATIC_DIR || path.join(process.cwd(), "public");

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: "Too many login attempts. Please try again later." },
});
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { error: "Too many requests. Please slow down." },
});

app.use(cors());
app.use(express.json());
app.use(requestLogger);

app.use("/api/auth/login", authLimiter);
app.use("/api/auth", authRouter);
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api", apiLimiter, jwtAuth);

app.use("/api/reviews", reviewsRouter);
app.use("/api/repositories", requireRole("admin"), repositoriesRouter);
app.use("/api/settings", requireRole("admin"), settingsRouter);
app.use("/api/credentials", requireRole("admin"), credentialsRouter);
app.use("/api/providers", requireRole("admin"), providersRouter);
app.use("/api/settings/prompt-template", requireRole("admin"), promptTemplateRouter);
app.use("/api/auth/users", requireRole("admin"), usersRouter);

const staticPath = STATIC_DIR;
app.use(express.static(staticPath));
app.get("*", (_req, res) => {
  res.sendFile(path.join(staticPath, "index.html"));
});

app.use(errorHandler);

async function start() {
  await initDb();
  app.listen(PORT, () => {
    logger.info(`AutoReview server running on port ${PORT}`);
    startAutoReviewPolling();
  });
}

process.on("SIGTERM", () => {
  stopAutoReviewPolling();
  process.exit(0);
});

process.on("SIGINT", () => {
  stopAutoReviewPolling();
  process.exit(0);
});

start();

export default app;
