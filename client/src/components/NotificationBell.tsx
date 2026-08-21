import { useEffect, useState, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { type RootState, type AppDispatch } from "@/store";
import { fetchNotifications, fetchUnreadCount, markNotificationRead, markAllRead } from "@/store/notificationsSlice";
import { Bell, BellOff, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import { fadeIn, useReducedMotionVariants } from "@/lib/motion";

export function NotificationBell({ placement = "bottom-right" }: { placement?: "bottom-right" | "top-left" }) {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const { items, unreadCount } = useSelector((state: RootState) => state.notifications);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const popoverVariants = useReducedMotionVariants(fadeIn);

  useEffect(() => {
    dispatch(fetchUnreadCount());
  }, [dispatch]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", handleClick);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const toggleOpen = async () => {
    if (!open) {
      await Promise.all([dispatch(fetchUnreadCount()), dispatch(fetchNotifications())]);
    }
    setOpen(!open);
  };

  const handleItemClick = async (id: string, entityType: string | null, entityId: string | null) => {
    await dispatch(markNotificationRead(id));
    if (entityType === "review" && entityId) {
      navigate(`/reviews/${entityId}`);
    }
    setOpen(false);
  };

  const handleMarkAllRead = async () => {
    await dispatch(markAllRead());
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        variant="ghost"
        size="icon-sm"
        className="relative text-muted-foreground hover:text-foreground"
        onClick={toggleOpen}
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-xs font-bold leading-none text-destructive-foreground ring-2 ring-card">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </Button>

      {open && (
        <motion.div
          initial="hidden"
          animate="visible"
          variants={popoverVariants}
          role="dialog"
          aria-label="Notifications"
          className={cn(
            "absolute z-50 w-80 overflow-hidden rounded-xl border border-border bg-popover shadow-card",
            placement === "top-left" ? "bottom-full left-0 mb-2" : "right-0 top-full mt-2"
          )}
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-muted-foreground outline-none transition-colors duration-fast ease-out-expo hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <CheckCheck className="h-3 w-3" />
                Mark all read
              </button>
            )}
          </div>
          <div className="custom-scroll max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                <BellOff className="h-5 w-5 text-muted-foreground/60" />
                <p className="text-xs text-muted-foreground">No notifications yet</p>
              </div>
            ) : (
              items.map((notif) => (
                <button
                  key={notif.id}
                  onClick={() => handleItemClick(notif.id, notif.entity_type, notif.entity_id)}
                  className={cn(
                    "w-full border-b border-border px-4 py-3 text-left outline-none transition-colors duration-fast ease-out-expo last:border-0 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                    notif.read ? "bg-popover hover:bg-accent/50" : "bg-accent/40 hover:bg-accent"
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    {!notif.read && <div className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-foreground" aria-hidden="true" />}
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-xs leading-snug text-foreground", !notif.read && "font-semibold")}>{notif.title}</p>
                      {notif.message && <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{notif.message}</p>}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {new Date(notif.created_at).toLocaleDateString()} {new Date(notif.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}
