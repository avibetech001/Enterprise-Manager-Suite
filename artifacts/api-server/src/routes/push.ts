import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, pushSubscriptionsTable } from "@workspace/db";
import {
  GetPushPublicKeyResponse,
  SubscribeToPushBody,
  UnsubscribeFromPushBody,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { getVapidKeys } from "../lib/push";

const router: IRouter = Router();

router.get("/push/public-key", requireAuth, async (_req, res) => {
  const keys = await getVapidKeys();
  res.json(GetPushPublicKeyResponse.parse({ publicKey: keys.publicKey }));
});

router.post("/push/subscriptions", requireAuth, async (req, res) => {
  const parsed = SubscribeToPushBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const me = req.currentUser!;
  await db
    .insert(pushSubscriptionsTable)
    .values({
      companyId: me.companyId,
      userId: me.id,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.p256dh,
      auth: parsed.data.auth,
    })
    .onConflictDoUpdate({
      target: pushSubscriptionsTable.endpoint,
      set: {
        companyId: me.companyId,
        userId: me.id,
        p256dh: parsed.data.p256dh,
        auth: parsed.data.auth,
      },
    });
  res.sendStatus(204);
});

router.post("/push/unsubscribe", requireAuth, async (req, res) => {
  const parsed = UnsubscribeFromPushBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  // Only the owner of a subscription may remove it.
  const me = req.currentUser!;
  await db
    .delete(pushSubscriptionsTable)
    .where(
      and(
        eq(pushSubscriptionsTable.endpoint, parsed.data.endpoint),
        eq(pushSubscriptionsTable.userId, me.id),
      ),
    );
  res.sendStatus(204);
});

export default router;
