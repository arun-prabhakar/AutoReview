import { Router } from "express";
import { getFindingsByCategoryOverTime, getTopProblemFiles, getFindingDensityPerRepo, getCostSummary, getRepoHealthScore, getAllRepoHealthScores } from "../services/storage-service.js";
import { logger } from "../middleware/index.js";

export const analyticsRouter = Router();

analyticsRouter.get("/findings-over-time", async (_req, res) => {
  try {
    const data = await getFindingsByCategoryOverTime(30);
    res.json(data);
  } catch (err) {
    logger.error("Failed to fetch findings-over-time", { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

analyticsRouter.get("/top-files", async (_req, res) => {
  try {
    const data = await getTopProblemFiles(20);
    res.json(data);
  } catch (err) {
    logger.error("Failed to fetch top-files", { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

analyticsRouter.get("/finding-density", async (_req, res) => {
  try {
    const data = await getFindingDensityPerRepo();
    res.json(data);
  } catch (err) {
    logger.error("Failed to fetch finding-density", { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

analyticsRouter.get("/cost-summary", async (_req, res) => {
  try {
    const data = await getCostSummary(30);
    res.json(data);
  } catch (err) {
    logger.error("Failed to fetch cost-summary", { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

analyticsRouter.get("/health-score/:repoId", async (req, res) => {
  try {
    const data = await getRepoHealthScore(req.params.repoId);
    res.json(data);
  } catch (err) {
    logger.error("Failed to fetch health-score", { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

analyticsRouter.get("/health-scores", async (_req, res) => {
  try {
    const data = await getAllRepoHealthScores();
    res.json(data);
  } catch (err) {
    logger.error("Failed to fetch health-scores", { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
});
