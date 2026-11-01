import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, noteDraftsTable } from "@workspace/db";
import {
  GetMyNoteDraftResponse,
  SaveMyNoteDraftBody,
  SaveMyNoteDraftResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

router.get("/me/note-draft", requireAuth, async (req, res): Promise<void> => {
  const me = req.currentUser!;
  const [draft] = await db
    .select({
      content: noteDraftsTable.content,
      updatedAt: noteDraftsTable.updatedAt,
    })
    .from(noteDraftsTable)
    .where(
      and(
        eq(noteDraftsTable.userId, me.id),
        eq(noteDraftsTable.companyId, me.companyId),
      ),
    );

  res.json(
    GetMyNoteDraftResponse.parse({
      content: draft?.content ?? "",
      updatedAt: draft?.updatedAt ?? null,
    }),
  );
});

router.put("/me/note-draft", requireAuth, async (req, res): Promise<void> => {
  const parsed = SaveMyNoteDraftBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid note draft." });
    return;
  }

  const me = req.currentUser!;
  const [draft] = await db
    .insert(noteDraftsTable)
    .values({
      companyId: me.companyId,
      userId: me.id,
      content: parsed.data.content,
    })
    .onConflictDoUpdate({
      target: noteDraftsTable.userId,
      set: {
        content: parsed.data.content,
        updatedAt: new Date(),
      },
    })
    .returning({
      content: noteDraftsTable.content,
      updatedAt: noteDraftsTable.updatedAt,
    });

  res.json(SaveMyNoteDraftResponse.parse(draft));
});

export default router;
