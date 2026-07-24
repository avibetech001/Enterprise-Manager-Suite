import webpush from "web-push";
import { and, count, eq, inArray, isNull, or } from "drizzle-orm";
import {
  db,
  notificationsTable,
  pushSubscriptionsTable,
  pushVapidConfigTable,
  usersTable,
} from "@workspace/db";
import { logger } from "./logger";

let vapidReady: Promise<{ publicKey: string; privateKey: string }> | null =
  null;

// Load the VAPID key pair from the database, generating it on first use.
export function getVapidKeys(): Promise<{
  publicKey: string;
  privateKey: string;
}> {
  if (!vapidReady) {
    vapidReady = (async () => {
      // Singleton row with fixed id=1; concurrent first-use is safe because
      // the insert is a no-op when the row already exists.
      const load = async () => {
        const [row] = await db
          .select()
          .from(pushVapidConfigTable)
          .where(eq(pushVapidConfigTable.id, 1));
        return row;
      };
      let row = await load();
      if (!row) {
        const keys = webpush.generateVAPIDKeys();
        await db
          .insert(pushVapidConfigTable)
          .values({ id: 1, publicKey: keys.publicKey, privateKey: keys.privateKey })
          .onConflictDoNothing();
        row = await load();
      }
      if (!row) throw new Error("Failed to initialize VAPID keys");
      return { publicKey: row.publicKey, privateKey: row.privateKey };
    })();
  }
  return vapidReady;
}

async function sendToSubscriptions(
  subs: (typeof pushSubscriptionsTable.$inferSelect)[],
  payload: string,
): Promise<void> {
  if (subs.length === 0) return;
  const keys = await getVapidKeys();
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload,
          {
            vapidDetails: {
              subject: "mailto:info@contentafrica.com",
              publicKey: keys.publicKey,
              privateKey: keys.privateKey,
            },
          },
        );
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          // Subscription expired or revoked — clean it up.
          await db
            .delete(pushSubscriptionsTable)
            .where(eq(pushSubscriptionsTable.id, sub.id));
        } else {
          logger.warn({ err }, "web push send failed");
        }
      }
    }),
  );
}

// Send a push to the right audience: a specific user, or (userId null)
// all management users (super_admin/hr) of the company.
export async function sendPush(
  companyId: number,
  message: string,
  userId: number | null,
): Promise<void> {
  try {
    // Unread count for the recipient feed, so the app icon badge can show it.
    // Employees see their own feed; management shares the company-wide feed.
    const [row] = await db
      .select({ n: count() })
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.companyId, companyId),
          userId != null
            ? eq(notificationsTable.userId, userId)
            : isNull(notificationsTable.userId),
          isNull(notificationsTable.readAt),
        ),
      );
    const payload = JSON.stringify({
      title: "5th Element",
      body: message,
      badge: row?.n ?? 0,
    });
    if (userId != null) {
      const subs = await db
        .select()
        .from(pushSubscriptionsTable)
        .where(
          and(
            eq(pushSubscriptionsTable.companyId, companyId),
            eq(pushSubscriptionsTable.userId, userId),
          ),
        );
      await sendToSubscriptions(subs, payload);
      return;
    }
    const managers = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.companyId, companyId),
          or(eq(usersTable.role, "super_admin"), eq(usersTable.role, "hr")),
        ),
      );
    if (managers.length === 0) return;
    const subs = await db
      .select()
      .from(pushSubscriptionsTable)
      .where(
        and(
          eq(pushSubscriptionsTable.companyId, companyId),
          inArray(
            pushSubscriptionsTable.userId,
            managers.map((m) => m.id),
          ),
        ),
      );
    await sendToSubscriptions(subs, payload);
  } catch (err) {
    // Push is best-effort; never break the main flow.
    logger.warn({ err }, "web push dispatch failed");
  }
}
