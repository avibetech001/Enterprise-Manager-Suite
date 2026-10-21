import {
  getListPrivateConversationsQueryKey,
  useListPrivateConversations,
} from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";

export function PrivateChatUnreadBadge() {
  const { data: conversations } = useListPrivateConversations({
    query: {
      queryKey: getListPrivateConversationsQueryKey(),
      refetchInterval: 10_000,
    },
  });
  const unreadCount =
    conversations?.reduce(
      (total, conversation) =>
        total +
        (Number.isFinite(conversation.unreadCount) ? conversation.unreadCount : 0),
      0,
    ) ?? 0;

  if (unreadCount === 0) return null;

  return (
    <Badge
      variant="destructive"
      aria-label={`${unreadCount} unread private messages`}
      className="ml-auto h-5 min-w-5 rounded-full px-1.5 text-[10px]"
    >
      {unreadCount > 99 ? "99+" : unreadCount}
    </Badge>
  );
}
