import { db, notificationsTable } from "@workspace/db";
import { sendPush } from "./push";

// Insert a notification. userId = null targets the management feed;
// a concrete userId targets that employee's feed.
// `link` is a role-agnostic in-app path suffix (e.g. "chat?group=dept-3");
// the frontend prefixes it with "/employee/" or "/" based on the viewer role.
export async function notify(
  companyId: number,
  type: string,
  message: string,
  userId: number | null = null,
  link: string | null = null,
): Promise<void> {
  await db.insert(notificationsTable).values({
    companyId,
    userId,
    type,
    message,
    link,
  });
  // Fire-and-forget web push to the same audience.
  void sendPush(companyId, message, userId);
}
