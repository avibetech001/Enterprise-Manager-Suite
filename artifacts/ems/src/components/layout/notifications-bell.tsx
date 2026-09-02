import { useState } from "react";
import { useLocation } from "wouter";
import { useListNotifications, useMarkNotificationRead, useMarkAllNotificationsRead, getListNotificationsQueryKey, useGetCurrentSession } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCircle2, UserPlus, FileEdit, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";

// Map notification types without an explicit link to a sensible page.
const TYPE_FALLBACK_LINK: Record<string, string> = {
  chat_mention: "chat",
  chat_direct: "chat",
  appraisal: "appraisals",
};

export function NotificationsBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { data: session } = useGetCurrentSession();
  const { data: notifications } = useListNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const isEmployee = session?.user?.role === "employee";

  // Notification links are stored role-agnostic (e.g. "chat?group=dept-3");
  // prefix them with the right base path for the current viewer.
  const targetFor = (n: { link?: string | null; type: string }): string | null => {
    const suffix = n.link || TYPE_FALLBACK_LINK[n.type] || null;
    if (!suffix) return null;
    return (isEmployee ? "/employee/" : "/") + suffix;
  };

  const handleOpen = (notification: { id: number; readAt: string | null; link?: string | null; type: string }) => {
    if (!notification.readAt) handleMarkRead(notification.id);
    const target = targetFor(notification);
    if (target) {
      setIsOpen(false);
      // wouter's navigate drops query strings from the matcher but keeps the URL.
      navigate(target);
    }
  };

  const unreadCount = notifications?.filter((n) => !n.readAt).length || 0;
  const recentNotifications = notifications?.slice(0, 10) || [];

  const getIconForType = (type: string) => {
    switch (type) {
      case "employee_created":
        return <UserPlus className="h-4 w-4 text-emerald-500" />;
      case "employee_activated":
        return <CheckCircle2 className="h-4 w-4 text-primary" />;
      case "employee_profile_updated":
        return <FileEdit className="h-4 w-4 text-amber-500" />;
      default:
        return <Bell className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const handleMarkRead = (id: number) => {
    markRead.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
      }
    });
  };

  const handleMarkAllRead = () => {
    markAllRead.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
      }
    });
  };

  // Opening the bell counts as "seeing" the notifications: clear the unread
  // counter (nav badge + app icon number) once the panel closes.
  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open && unreadCount > 0) handleMarkAllRead();
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-8 w-8 rounded-full">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <Badge 
              variant="destructive" 
              className="absolute -top-1 -right-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full p-0 text-[10px]"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-80" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">Notifications</p>
            <p className="text-xs text-muted-foreground">
              You have {unreadCount} unread messages
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="max-h-[300px] overflow-y-auto">
          {recentNotifications.length > 0 ? (
            <DropdownMenuGroup>
              {recentNotifications.map((notification) => (
                <DropdownMenuItem 
                  key={notification.id} 
                  className={`flex items-start gap-3 p-3 cursor-pointer ${!notification.readAt ? "bg-muted/50" : ""}`}
                  onClick={() => handleOpen(notification)}
                >
                  <div className="mt-0.5">
                    {getIconForType(notification.type)}
                  </div>
                  <div className="flex flex-col gap-1 flex-1">
                    <span className="text-sm font-medium leading-none">
                      {notification.message}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                  {!notification.readAt && (
                    <Circle className="h-2 w-2 fill-primary text-primary mt-1 flex-shrink-0" />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          ) : (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No notifications yet
            </div>
          )}
        </div>
        {unreadCount > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              className="w-full text-center cursor-pointer justify-center text-primary"
              onClick={(e) => {
                e.preventDefault();
                handleMarkAllRead();
              }}
            >
              Mark all as read
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
