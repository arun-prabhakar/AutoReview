import { Router } from "express";
import { getFindingsByCategoryOverTime, getTopProblemFiles, getFindingDensityPerRepo, getDispositionStats, getCostSummary, getRepoHealthScore, getAllRepoHealthScores, getBreachedSlaFindings, getSlaStats } from "../services/storage-service.js";

export const analyticsRouter = Router();

analyticsRouter.get("/findings-over-time", async (_req, res) => {
  const data = await getFindingsByCategoryOverTime(30);
  res.json(data);
});

analyticsRouter.get("/top-files", async (_req, res) => {
  const data = await getTopProblemFiles(20);
  res.json(data);
});

analyticsRouter.get("/finding-density", async (_req, res) => {
  const data = await getFindingDensityPerRepo();
  res.json(data);
});

analyticsRouter.get("/disposition-stats", async (_req, res) => {
  const data = await getDispositionStats();
  res.json(data);
});

analyticsRouter.get("/cost-summary", async (_req, res) => {
  const data = await getCostSummary(30);
  res.json(data);
});

analyticsRouter.get("/health-score/:repoId", async (req, res) => {
  const data = await getRepoHealthScore(req.params.repoId);
  res.json(data);
});

analyticsRouter.get("/health-scores", async (_req, res) => {
  const data = await getAllRepoHealthScores();
  res.json(data);
});

analyticsRouter.get("/sla-breached", async (_req, res) => {
  const data = await getBreachedSlaFindings();
  res.json(data);
});

analyticsRouter.get("/sla-stats", async (_req, res) => {
  const data = await getSlaStats();
  res.json(data);
});
