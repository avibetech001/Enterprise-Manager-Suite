import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, noteDraftsTable } from "@workspace/db";
import {
  CreateMyNoteBody,
  CreateMyNoteResponse,
  ListMyNotesResponseItem,
  UpdateMyNoteBody,
  UpdateMyNoteParams,
  UpdateMyNoteResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

function titleFromContent(content: string): string {
  return (
    content
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean)
      ?.slice(0, 120) ?? "Untitled note"
  );
}

router.get("/me/notes", requireAuth, async (req, res): Promise<void> => {
  const me = req.currentUser!;
  const notes = await db
    .select()
    .from(noteDraftsTable)
    .where(
      and(
        eq(noteDraftsTable.userId, me.id),
        eq(noteDraftsTable.companyId, me.companyId),
      ),
    )
    .orderBy(desc(noteDraftsTable.updatedAt), desc(noteDraftsTable.id));

  res.json(
    notes.map((note) =>
      ListMyNotesResponseItem.parse({
        id: note.id,
        content: note.content,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
      }),
    ),
  );
});

router.post("/me/notes", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateMyNoteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid note draft." });
    return;
  }

  const me = req.currentUser!;
  const [note] = await db
    .insert(noteDraftsTable)
    .values({
      companyId: me.companyId,
      userId: me.id,
      title: titleFromContent(parsed.data.content),
      content: parsed.data.content,
    })
    .returning();

  res.status(201).json(
    CreateMyNoteResponse.parse({
      id: note.id,
      content: note.content,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
    }),
  );
});

router.patch(
  "/me/notes/:noteId",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = UpdateMyNoteParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid note." });
      return;
    }
    const parsed = UpdateMyNoteBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid note draft." });
      return;
    }

    const me = req.currentUser!;
    const [note] = await db
      .update(noteDraftsTable)
      .set({
        title: titleFromContent(parsed.data.content),
        content: parsed.data.content,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(noteDraftsTable.id, params.data.noteId),
          eq(noteDraftsTable.userId, me.id),
          eq(noteDraftsTable.companyId, me.companyId),
        ),
      )
      .returning();

    if (!note) {
      res.status(404).json({ error: "Note not found." });
      return;
    }

    res.json(
      UpdateMyNoteResponse.parse({
        id: note.id,
        content: note.content,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
      }),
    );
  },
);

export default router;
