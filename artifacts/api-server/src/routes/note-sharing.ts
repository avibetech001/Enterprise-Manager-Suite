import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { Router, type IRouter } from "express";
import {
  and,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  sql,
} from "drizzle-orm";
import {
  db,
  noteDraftsTable,
  noteExternalAccessRequestsTable,
  noteExternalSharesTable,
  noteInternalSharesTable,
  usersTable,
  type User,
} from "@workspace/db";
import {
  CreateExternalNoteShareParams,
  CreateExternalNoteShareResponse,
  GetMyNoteSharesParams,
  GetMyNoteSharesResponse,
  ListNoteShareOptionsResponse,
  ListSharedNotesResponse,
  RequestExternalNoteCodeBody,
  RequestExternalNoteCodeResponse,
  RevokeExternalNoteShareParams,
  RevokeExternalNoteShareResponse,
  UpdateMyNoteSharesBody,
  UpdateMyNoteSharesParams,
  UpdateMyNoteSharesResponse,
  VerifyExternalNoteCodeBody,
  VerifyExternalNoteCodeResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { notify } from "../lib/notify";
import {
  canReadSharedNote,
  canUseExternalNoteCode,
  canUseExternalNoteShare,
  isNoteShareRequestWithinLimits,
} from "../lib/noteSharingAccess";

const router: IRouter = Router();
const CODE_TTL_MS = 24 * 60 * 60 * 1000;
const REQUEST_WINDOW_MS = 60 * 60 * 1000;
const MAX_REQUESTS_PER_LINK_PER_HOUR = 10;
const MAX_REQUESTS_PER_EMAIL_PER_HOUR = 3;
const MAX_CODE_ATTEMPTS = 5;
const GENERIC_ACCESS_REQUEST_MESSAGE =
  "If this share link is active, the note owner has received your request.";

function hashShareToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function getOwnedNote(
  user: User,
  noteId: number,
): Promise<typeof noteDraftsTable.$inferSelect | undefined> {
  const [note] = await db
    .select()
    .from(noteDraftsTable)
    .where(
      and(
        eq(noteDraftsTable.id, noteId),
        eq(noteDraftsTable.userId, user.id),
        eq(noteDraftsTable.companyId, user.companyId),
      ),
    )
    .limit(1);
  return note;
}

async function getSharingSettings(
  noteId: number,
  companyId: number,
  ownerUserId: number,
) {
  const recipients = await db
    .select({
      userId: usersTable.id,
      fullName: usersTable.fullName,
      email: usersTable.email,
    })
    .from(noteInternalSharesTable)
    .innerJoin(
      usersTable,
      eq(noteInternalSharesTable.recipientUserId, usersTable.id),
    )
    .where(
      and(
        eq(noteInternalSharesTable.noteId, noteId),
        eq(noteInternalSharesTable.companyId, companyId),
        eq(noteInternalSharesTable.ownerUserId, ownerUserId),
        eq(usersTable.status, "active"),
        eq(usersTable.archived, false),
      ),
    )
    .orderBy(usersTable.fullName);
  const [externalShare] = await db
    .select({ active: noteExternalSharesTable.active })
    .from(noteExternalSharesTable)
    .where(
      and(
        eq(noteExternalSharesTable.noteId, noteId),
        eq(noteExternalSharesTable.companyId, companyId),
        eq(noteExternalSharesTable.ownerUserId, ownerUserId),
      ),
    )
    .limit(1);

  return {
    recipients,
    externalShareActive: externalShare?.active ?? false,
  };
}

router.get("/me/notes/share-options", requireAuth, async (req, res): Promise<void> => {
  const me = req.currentUser!;
  const users = await db
    .select({
      userId: usersTable.id,
      fullName: usersTable.fullName,
      email: usersTable.email,
    })
    .from(usersTable)
    .where(
      and(
        eq(usersTable.companyId, me.companyId),
        eq(usersTable.role, "employee"),
        eq(usersTable.status, "active"),
        eq(usersTable.archived, false),
        sql`${usersTable.id} <> ${me.id}`,
      ),
    )
    .orderBy(usersTable.fullName);

  res.json(ListNoteShareOptionsResponse.parse(users));
});

router.get("/me/shared-notes", requireAuth, async (req, res): Promise<void> => {
  const me = req.currentUser!;
  const notes = await db
    .select({
      id: noteDraftsTable.id,
      ownerName: usersTable.fullName,
      content: noteDraftsTable.content,
      updatedAt: noteDraftsTable.updatedAt,
      sharedAt: noteInternalSharesTable.createdAt,
      recipientUserId: noteInternalSharesTable.recipientUserId,
      shareCompanyId: noteInternalSharesTable.companyId,
      noteCompanyId: noteDraftsTable.companyId,
    })
    .from(noteInternalSharesTable)
    .innerJoin(
      noteDraftsTable,
      and(
        eq(noteInternalSharesTable.noteId, noteDraftsTable.id),
        eq(noteInternalSharesTable.ownerUserId, noteDraftsTable.userId),
      ),
    )
    .innerJoin(usersTable, eq(noteDraftsTable.userId, usersTable.id))
    .where(
      and(
        eq(noteInternalSharesTable.recipientUserId, me.id),
        eq(noteInternalSharesTable.companyId, me.companyId),
        eq(noteDraftsTable.companyId, me.companyId),
        eq(usersTable.status, "active"),
        eq(usersTable.archived, false),
      ),
    )
    .orderBy(desc(noteInternalSharesTable.createdAt));

  const accessibleNotes = notes
    .filter((note) =>
      canReadSharedNote(me, {
        recipientUserId: note.recipientUserId,
        companyId: note.shareCompanyId,
        noteCompanyId: note.noteCompanyId,
      }),
    )
    .map(({ recipientUserId: _recipientUserId, shareCompanyId: _shareCompanyId, noteCompanyId: _noteCompanyId, ...note }) => note);

  res.json(ListSharedNotesResponse.parse(accessibleNotes));
});

router.get(
  "/me/notes/:noteId/shares",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = GetMyNoteSharesParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid note." });
      return;
    }
    const me = req.currentUser!;
    const note = await getOwnedNote(me, params.data.noteId);
    if (!note) {
      res.status(404).json({ error: "Note not found." });
      return;
    }
    res.json(
      GetMyNoteSharesResponse.parse(
        await getSharingSettings(note.id, me.companyId, me.id),
      ),
    );
  },
);

router.put(
  "/me/notes/:noteId/shares",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = UpdateMyNoteSharesParams.safeParse(req.params);
    const parsed = UpdateMyNoteSharesBody.safeParse(req.body);
    if (!params.success || !parsed.success) {
      res.status(400).json({ error: "Invalid note-sharing request." });
      return;
    }
    const me = req.currentUser!;
    const note = await getOwnedNote(me, params.data.noteId);
    if (!note) {
      res.status(404).json({ error: "Note not found." });
      return;
    }

    const recipientIds = parsed.data.recipientUserIds;
    if (new Set(recipientIds).size !== recipientIds.length) {
      res.status(400).json({ error: "Recipients must not be duplicated." });
      return;
    }
    const recipients =
      recipientIds.length > 0
        ? await db
            .select({
              userId: usersTable.id,
              fullName: usersTable.fullName,
              email: usersTable.email,
            })
            .from(usersTable)
            .where(
              and(
                inArray(usersTable.id, recipientIds),
                eq(usersTable.companyId, me.companyId),
                eq(usersTable.role, "employee"),
                eq(usersTable.status, "active"),
                eq(usersTable.archived, false),
              ),
            )
        : [];
    if (recipients.length !== recipientIds.length) {
      res.status(400).json({
        error: "Choose active employees from your company only.",
      });
      return;
    }

    const newlySharedRecipients = await db.transaction(async (tx) => {
      const existing = await tx
        .select({ recipientUserId: noteInternalSharesTable.recipientUserId })
        .from(noteInternalSharesTable)
        .where(
          and(
            eq(noteInternalSharesTable.noteId, note.id),
            eq(noteInternalSharesTable.companyId, me.companyId),
            eq(noteInternalSharesTable.ownerUserId, me.id),
          ),
        );
      const existingIds = new Set(
        existing.map((row) => row.recipientUserId),
      );
      await tx
        .delete(noteInternalSharesTable)
        .where(
          and(
            eq(noteInternalSharesTable.noteId, note.id),
            eq(noteInternalSharesTable.companyId, me.companyId),
            eq(noteInternalSharesTable.ownerUserId, me.id),
          ),
        );
      if (recipients.length > 0) {
        await tx.insert(noteInternalSharesTable).values(
          recipients.map((recipient) => ({
            companyId: me.companyId,
            noteId: note.id,
            ownerUserId: me.id,
            recipientUserId: recipient.userId,
          })),
        );
      }
      return recipients.filter((recipient) => !existingIds.has(recipient.userId));
    });

    for (const recipient of newlySharedRecipients) {
      void notify(
        me.companyId,
        "note_shared",
        `${me.fullName} shared a note with you.`,
        recipient.userId,
        "notes",
      ).catch((error: unknown) => {
        req.log.warn({ err: error, recipientUserId: recipient.userId }, "Could not notify employee about a shared note");
      });
    }

    res.json(
      UpdateMyNoteSharesResponse.parse(
        await getSharingSettings(note.id, me.companyId, me.id),
      ),
    );
  },
);

router.post(
  "/me/notes/:noteId/external-share",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = CreateExternalNoteShareParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid note." });
      return;
    }
    const me = req.currentUser!;
    const note = await getOwnedNote(me, params.data.noteId);
    if (!note) {
      res.status(404).json({ error: "Note not found." });
      return;
    }

    const token = crypto.randomBytes(32).toString("base64url");
    const tokenHash = hashShareToken(token);
    await db.transaction(async (tx) => {
      const [share] = await tx
        .insert(noteExternalSharesTable)
        .values({
          companyId: me.companyId,
          noteId: note.id,
          ownerUserId: me.id,
          tokenHash,
          active: true,
          createdAt: new Date(),
          revokedAt: null,
        })
        .onConflictDoUpdate({
          target: noteExternalSharesTable.noteId,
          set: {
            companyId: me.companyId,
            ownerUserId: me.id,
            tokenHash,
            active: true,
            createdAt: new Date(),
            revokedAt: null,
          },
        })
        .returning({ id: noteExternalSharesTable.id });
      await tx
        .delete(noteExternalAccessRequestsTable)
        .where(eq(noteExternalAccessRequestsTable.shareId, share.id));
    });

    res.json(CreateExternalNoteShareResponse.parse({ token }));
  },
);

router.delete(
  "/me/notes/:noteId/external-share",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = RevokeExternalNoteShareParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid note." });
      return;
    }
    const me = req.currentUser!;
    const note = await getOwnedNote(me, params.data.noteId);
    if (!note) {
      res.status(404).json({ error: "Note not found." });
      return;
    }

    const revokedAt = new Date();
    const [share] = await db
      .update(noteExternalSharesTable)
      .set({ active: false, revokedAt })
      .where(
        and(
          eq(noteExternalSharesTable.noteId, note.id),
          eq(noteExternalSharesTable.companyId, me.companyId),
          eq(noteExternalSharesTable.ownerUserId, me.id),
          eq(noteExternalSharesTable.active, true),
        ),
      )
      .returning({ id: noteExternalSharesTable.id });
    if (!share) {
      res.status(404).json({ error: "No active external link found." });
      return;
    }

    await db
      .delete(noteExternalAccessRequestsTable)
      .where(eq(noteExternalAccessRequestsTable.shareId, share.id));
    res.status(204).json(RevokeExternalNoteShareResponse.parse(undefined));
  },
);

router.post(
  "/public/note-shares/request-code",
  async (req, res): Promise<void> => {
    const parsed = RequestExternalNoteCodeBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Enter a valid email address." });
      return;
    }

    const normalizedEmail = normalizeEmail(parsed.data.email);
    const tokenHash = hashShareToken(parsed.data.token);
    const now = new Date();
    const windowStart = new Date(now.getTime() - REQUEST_WINDOW_MS);
    const code = crypto.randomInt(10_000_000, 100_000_000).toString();

    const result = await db.transaction(async (tx) => {
      const [share] = await tx
        .select()
        .from(noteExternalSharesTable)
        .where(
          eq(noteExternalSharesTable.tokenHash, tokenHash),
        )
        .limit(1)
        .for("update");
      if (!share || !canUseExternalNoteShare(share, tokenHash)) {
        return { kind: "unavailable" as const };
      }
      const [owner] = await tx
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(
          and(
            eq(usersTable.id, share.ownerUserId),
            eq(usersTable.companyId, share.companyId),
            eq(usersTable.status, "active"),
            eq(usersTable.archived, false),
          ),
        )
        .limit(1);
      if (!owner) return { kind: "unavailable" as const };

      const [linkRequestCount] = await tx
        .select({ total: count() })
        .from(noteExternalAccessRequestsTable)
        .where(
          and(
            eq(noteExternalAccessRequestsTable.shareId, share.id),
            gte(noteExternalAccessRequestsTable.createdAt, windowStart),
          ),
        );
      const [emailRequestCount] = await tx
        .select({ total: count() })
        .from(noteExternalAccessRequestsTable)
        .where(
          and(
            eq(noteExternalAccessRequestsTable.shareId, share.id),
            eq(
              noteExternalAccessRequestsTable.requesterEmail,
              normalizedEmail,
            ),
            gte(noteExternalAccessRequestsTable.createdAt, windowStart),
          ),
        );
      if (
        !isNoteShareRequestWithinLimits(
          Number(linkRequestCount?.total ?? 0),
          Number(emailRequestCount?.total ?? 0),
          MAX_REQUESTS_PER_LINK_PER_HOUR,
          MAX_REQUESTS_PER_EMAIL_PER_HOUR,
        )
      ) {
        return { kind: "rate-limited" as const };
      }

      const codeHash = await bcrypt.hash(code, 10);
      await tx.insert(noteExternalAccessRequestsTable).values({
        shareId: share.id,
        requesterEmail: normalizedEmail,
        codeHash,
        failedAttempts: 0,
        createdAt: now,
        expiresAt: new Date(now.getTime() + CODE_TTL_MS),
      });
      return { kind: "issued" as const, share };
    });

    if (result.kind === "issued") {
      const [note] = await db
        .select({ title: noteDraftsTable.title })
        .from(noteDraftsTable)
        .where(
          and(
            eq(noteDraftsTable.id, result.share.noteId),
            eq(noteDraftsTable.userId, result.share.ownerUserId),
            eq(noteDraftsTable.companyId, result.share.companyId),
          ),
        )
        .limit(1);
      try {
        await notify(
          result.share.companyId,
          "note_access_request",
          `Access requested for "${note?.title || "a note"}" by ${normalizedEmail}. Share this one-time code: ${code}. It expires in 24 hours.`,
          result.share.ownerUserId,
          "notes",
        );
      } catch (error) {
        req.log.error({ err: error }, "Could not notify note owner about an access request");
      }
    }

    res
      .status(202)
      .json(
        RequestExternalNoteCodeResponse.parse({
          message: GENERIC_ACCESS_REQUEST_MESSAGE,
        }),
      );
  },
);

router.post(
  "/public/note-shares/verify",
  async (req, res): Promise<void> => {
    const parsed = VerifyExternalNoteCodeBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid or expired access code." });
      return;
    }

    const tokenHash = hashShareToken(parsed.data.token);
    const normalizedEmail = normalizeEmail(parsed.data.email);
    const code = parsed.data.code;
    const now = new Date();
    const result = await db.transaction(async (tx) => {
      const [share] = await tx
        .select()
        .from(noteExternalSharesTable)
        .where(
          eq(noteExternalSharesTable.tokenHash, tokenHash),
        )
        .limit(1)
        .for("update");
      if (!share || !canUseExternalNoteShare(share, tokenHash)) {
        return { kind: "unavailable" as const };
      }

      const [accessRequest] = await tx
        .select()
        .from(noteExternalAccessRequestsTable)
        .where(
          and(
            eq(noteExternalAccessRequestsTable.shareId, share.id),
            eq(
              noteExternalAccessRequestsTable.requesterEmail,
              normalizedEmail,
            ),
            isNull(noteExternalAccessRequestsTable.usedAt),
            gte(noteExternalAccessRequestsTable.expiresAt, now),
            lt(
              noteExternalAccessRequestsTable.failedAttempts,
              MAX_CODE_ATTEMPTS,
            ),
          ),
        )
        .orderBy(desc(noteExternalAccessRequestsTable.createdAt))
        .limit(1);
      if (
        !accessRequest ||
        !canUseExternalNoteCode(
          accessRequest,
          share,
          normalizedEmail,
          now,
          MAX_CODE_ATTEMPTS,
        )
      ) {
        return { kind: "invalid" as const };
      }

      const matches = await bcrypt.compare(code, accessRequest.codeHash);
      if (!matches) {
        await tx
          .update(noteExternalAccessRequestsTable)
          .set({
            failedAttempts: sql`${noteExternalAccessRequestsTable.failedAttempts} + 1`,
          })
          .where(
            and(
              eq(noteExternalAccessRequestsTable.id, accessRequest.id),
              isNull(noteExternalAccessRequestsTable.usedAt),
              lt(
                noteExternalAccessRequestsTable.failedAttempts,
                MAX_CODE_ATTEMPTS,
              ),
            ),
          );
        return { kind: "invalid" as const };
      }

      const [usedRequest] = await tx
        .update(noteExternalAccessRequestsTable)
        .set({ usedAt: now })
        .where(
          and(
            eq(noteExternalAccessRequestsTable.id, accessRequest.id),
            isNull(noteExternalAccessRequestsTable.usedAt),
            gte(noteExternalAccessRequestsTable.expiresAt, now),
            lt(
              noteExternalAccessRequestsTable.failedAttempts,
              MAX_CODE_ATTEMPTS,
            ),
          ),
        )
        .returning({ id: noteExternalAccessRequestsTable.id });
      if (!usedRequest) return { kind: "invalid" as const };

      const [note] = await tx
        .select({
          ownerName: usersTable.fullName,
          content: noteDraftsTable.content,
          updatedAt: noteDraftsTable.updatedAt,
        })
        .from(noteDraftsTable)
        .innerJoin(usersTable, eq(noteDraftsTable.userId, usersTable.id))
        .where(
          and(
            eq(noteDraftsTable.id, share.noteId),
            eq(noteDraftsTable.companyId, share.companyId),
            eq(noteDraftsTable.userId, share.ownerUserId),
            eq(usersTable.status, "active"),
            eq(usersTable.archived, false),
          ),
        )
        .limit(1);
      if (!note) return { kind: "unavailable" as const };
      return { kind: "verified" as const, note };
    });

    if (result.kind === "unavailable") {
      res.status(404).json({ error: "Share link not found or revoked." });
      return;
    }
    if (result.kind !== "verified") {
      res.status(400).json({ error: "Invalid or expired access code." });
      return;
    }
    res.json(VerifyExternalNoteCodeResponse.parse(result.note));
  },
);

export default router;
