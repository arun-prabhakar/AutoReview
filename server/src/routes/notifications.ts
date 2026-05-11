import { Router } from "express";
import { getNotifications, getUnreadCount, markNotificationRead, markAllNotificationsRead } from "../services/storage-service.js";

export const notificationsRouter = Router();

notificationsRouter.get("/", async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
  const notifications = await getNotifications(req.user?.id || "", limit);
  res.json(notifications);
});

notificationsRouter.get("/unread-count", async (req, res) => {
  const count = await getUnreadCount(req.user?.id || "");
  res.json({ count });
});

notificationsRouter.patch("/:id/read", async (req, res) => {
  await markNotificationRead(req.params.id, req.user?.id || "");
  res.json({ success: true });
});

notificationsRouter.post("/mark-all-read", async (req, res) => {
  await markAllNotificationsRead(req.user?.id || "");
  res.json({ success: true });
});
