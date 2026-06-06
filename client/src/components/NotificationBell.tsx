import { useEffect, useState, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { type RootState, type AppDispatch } from "@/store";
import { fetchNotifications, fetchUnreadCount, markNotificationRead, markAllRead } from "@/store/notificationsSlice";
import { Bell, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function NotificationBell({ placement = "bottom-right" }: { placement?: "bottom-right" | "top-left" }) {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const { items, unreadCount } = useSelector((state: RootState) => state.notifications);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dispatch(fetchUnreadCount());
  }, [dispatch]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
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
      <Button variant="ghost" size="icon" className="relative h-8 w-8" onClick={toggleOpen} aria-label="Notifications">
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center px-1">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </Button>

      {open && (
        <div className={cn("absolute w-80 rounded-lg border border-border bg-card shadow-lg z-50 overflow-hidden", placement === "top-left" ? "bottom-full mb-2 left-0" : "top-full mt-2 right-0")}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="text-sm font-semibold text-foreground">Notifications</span>
            {unreadCount > 0 && (
              <button onClick={handleMarkAllRead} className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
                <CheckCheck className="h-3 w-3" />
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto custom-scroll">
            {items.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-xs text-muted-foreground">No notifications yet</p>
              </div>
            ) : (
              items.map((notif) => (
                <button
                  key={notif.id}
                  onClick={() => handleItemClick(notif.id, notif.entity_type, notif.entity_id)}
                  className={cn(
                    "w-full text-left px-4 py-3 border-b border-border last:border-0 transition-colors",
                    notif.read ? "bg-card" : "bg-accent/50 hover:bg-accent"
                  )}
                >
                  <div className="flex items-start gap-2">
                    {!notif.read && <div className="h-2 w-2 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-xs text-foreground leading-snug", !notif.read && "font-semibold")}>{notif.title}</p>
                      {notif.message && <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{notif.message}</p>}
                      <p className="text-[10px] text-muted-foreground mt-1">{new Date(notif.created_at).toLocaleDateString()} {new Date(notif.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
