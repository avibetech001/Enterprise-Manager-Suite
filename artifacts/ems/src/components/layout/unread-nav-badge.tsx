import {
  useListNotifications,
  getListNotificationsQueryKey,
} from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";

// Small red counter shown on the Dashboard nav item when there are unread
// notifications (chat mentions, appraisals, approvals, ...).
export function UnreadNavBadge() {
  const { data: notifications } = useListNotifications({
    query: {
      queryKey: getListNotificationsQueryKey(),
      refetchInterval: 30000,
    },
  });
  const unread = notifications?.filter((n) => !n.readAt).length || 0;
  if (unread === 0) return null;
  return (
    <Badge
      variant="destructive"
      className="ml-auto h-5 min-w-5 px-1.5 rounded-full flex items-center justify-center text-[10px]"
    >
      {unread > 99 ? "99+" : unread}
    </Badge>
  );
}
