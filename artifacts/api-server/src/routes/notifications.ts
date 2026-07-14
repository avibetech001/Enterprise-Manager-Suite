import { Router, type IRouter } from "express";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db, notificationsTable } from "@workspace/db";
import {
  ListNotificationsResponse,
  MarkNotificationReadParams,
  MarkNotificationReadResponse,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../lib/auth";

const router: IRouter = Router();

router.get(
  "/notifications",
  requireAuth,
  requireRole("super_admin", "hr"),
  async (req, res): Promise<void> => {
    const rows = await db
      .select()
      .from(notificationsTable)
      .where(eq(notificationsTable.companyId, req.currentUser!.companyId))
      .orderBy(desc(notificationsTable.createdAt))
      .limit(100);
    res.json(ListNotificationsResponse.parse(rows));
  },
);

router.post(
  "/notifications/:id/read",
  requireAuth,
  requireRole("super_admin", "hr"),
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
          eq(notificationsTable.companyId, req.currentUser!.companyId),
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
  requireRole("super_admin", "hr"),
  async (req, res): Promise<void> => {
    await db
      .update(notificationsTable)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notificationsTable.companyId, req.currentUser!.companyId),
          isNull(notificationsTable.readAt),
        ),
      );
    res.sendStatus(204);
  },
);

export default router;
