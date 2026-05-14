import { Router } from "express";
import { getNotifications, getUnreadCount, markNotificationRead, markAllNotificationsRead } from "../services/storage-service.js";
import { logger } from "../middleware/index.js";

export const notificationsRouter = Router();

notificationsRouter.get("/", async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const notifications = await getNotifications(req.user?.id || "", limit);
    res.json(notifications);
  } catch (err) {
    logger.error("Failed to fetch notifications", { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

notificationsRouter.get("/unread-count", async (req, res) => {
  try {
    const count = await getUnreadCount(req.user?.id || "");
    res.json({ count });
  } catch (err) {
    logger.error("Failed to fetch unread count", { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: "Failed to fetch unread count" });
  }
});

notificationsRouter.patch("/:id/read", async (req, res) => {
  try {
    await markNotificationRead(req.params.id, req.user?.id || "");
    res.json({ success: true });
  } catch (err) {
    logger.error("Failed to mark notification read", { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: "Failed to mark notification" });
  }
});

notificationsRouter.post("/mark-all-read", async (req, res) => {
  try {
    await markAllNotificationsRead(req.user?.id || "");
    res.json({ success: true });
  } catch (err) {
    logger.error("Failed to mark all notifications read", { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: "Failed to mark notifications" });
  }
});
