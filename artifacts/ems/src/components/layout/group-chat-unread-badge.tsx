import {
  getListChatUnreadCountsQueryKey,
  useListChatUnreadCounts,
} from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";

type GroupChatUnreadBadgeProps = {
  scope: "all" | "departments";
};

export function GroupChatUnreadBadge({ scope }: GroupChatUnreadBadgeProps) {
  const { data: counts } = useListChatUnreadCounts({
    query: {
      queryKey: getListChatUnreadCountsQueryKey(),
      refetchInterval: 10_000,
    },
  });

  const unreadCount =
    counts?.reduce(
      (total, group) =>
        total +
        (scope === "departments" && group.kind !== "department"
          ? 0
          : Number.isFinite(group.unreadCount)
            ? group.unreadCount
            : 0),
      0,
    ) ?? 0;

  if (unreadCount === 0) return null;

  return (
    <Badge
      variant="destructive"
      aria-label={`${unreadCount} unread group messages`}
      className={`h-5 min-w-5 rounded-full px-1.5 text-[10px] ${
        scope === "departments" ? "ml-auto" : ""
      }`}
    >
      {unreadCount > 99 ? "99+" : unreadCount}
    </Badge>
  );
}
