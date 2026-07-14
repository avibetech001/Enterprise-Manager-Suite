import { Router, type IRouter } from "express";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { db, notificationsTable, type User } from "@workspace/db";
import {
  ListNotificationsResponse,
  MarkNotificationReadParams,
  MarkNotificationReadResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

// Employees see notifications targeted at them (userId = me).
// Management users see the company-wide management feed (userId is null).
function feedFilter(user: User): SQL {
  const base = eq(notificationsTable.companyId, user.companyId);
  if (user.role === "employee") {
    return and(base, eq(notificationsTable.userId, user.id))!;
  }
  return and(base, isNull(notificationsTable.userId))!;
}

router.get("/notifications", requireAuth, async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(notificationsTable)
    .where(feedFilter(req.currentUser!))
    .orderBy(desc(notificationsTable.createdAt))
    .limit(100);
  res.json(ListNotificationsResponse.parse(rows));
});

router.post(
  "/notifications/:id/read",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = MarkNotificationReadParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [updated] = await db
      .update(notificationsTable)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notificationsTable.id, params.data.id),
          feedFilter(req.currentUser!),
        ),
      )
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(MarkNotificationReadResponse.parse(updated));
  },
);

router.post(
  "/notifications/read-all",
  requireAuth,
  async (req, res): Promise<void> => {
    await db
      .update(notificationsTable)
      .set({ readAt: new Date() })
      .where(
        and(feedFilter(req.currentUser!), isNull(notificationsTable.readAt)),
      );
    res.sendStatus(204);
  },
);

export default router;
