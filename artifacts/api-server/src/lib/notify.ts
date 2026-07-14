import { db, notificationsTable } from "@workspace/db";

// Insert a notification. userId = null targets the management feed;
// a concrete userId targets that employee's feed.
export async function notify(
  companyId: number,
  type: string,
  message: string,
  userId: number | null = null,
): Promise<void> {
  await db.insert(notificationsTable).values({
    companyId,
    userId,
    type,
    message,
  });
}
