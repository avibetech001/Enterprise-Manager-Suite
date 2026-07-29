import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import {
  db,
  chatMessagesTable,
  departmentsTable,
  employmentInfoTable,
  usersTable,
} from "@workspace/db";
import {
  SendChatMessageBody,
  ListChatGroupsResponseItem as ChatGroup,
  ListChatGroupMembersResponseItem as ChatMember,
  ListChatMessagesResponseItem as ChatMessage,
} from "@workspace/api-zod";
import {
  DeleteChatMessageResponse,
} from "@workspace/api-zod";
import { alias } from "drizzle-orm/pg-core";
import { requireAuth } from "../lib/auth";
import { notify } from "../lib/notify";
import { sendPush } from "../lib/push";

const router: IRouter = Router();

type CurrentUser = NonNullable<Request["currentUser"]>;

// An employee's department lives in employment_info (managed from the
// Employees/Departments pages) — that is the source of truth for which
// department chat they belong to.
async function departmentIdOf(userId: number): Promise<number | null> {
  const [row] = await db
    .select({ departmentId: employmentInfoTable.departmentId })
    .from(employmentInfoTable)
    .where(eq(employmentInfoTable.userId, userId));
  return row?.departmentId ?? null;
}

interface ResolvedGroup {
  id: string;
  name: string;
  departmentId: number | null;
}

// Resolve a group id ("company" or "dept-<id>") and enforce access:
// - the company group is open to every user in the company
// - a department group is open only to users assigned to that department
async function resolveGroup(
  me: CurrentUser,
  groupId: string,
): Promise<ResolvedGroup | null> {
  if (groupId === "company") {
    return { id: "company", name: "General", departmentId: null };
  }
  const match = /^dept-(\d+)$/.exec(groupId);
  if (!match) return null;
  const deptId = Number(match[1]);
  const [dept] = await db
    .select()
    .from(departmentsTable)
    .where(
      and(
        eq(departmentsTable.id, deptId),
        eq(departmentsTable.companyId, me.companyId),
      ),
    );
  if (!dept) return null;
  // Super admins can access every department chat; everyone else must be
  // assigned to the department.
  if (me.role !== "super_admin" && (await departmentIdOf(me.id)) !== dept.id) {
    return null;
  }
  return { id: groupId, name: dept.name, departmentId: dept.id };
}

router.get(
  "/chat/groups",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const me = req.currentUser!;
    const groups: Array<{
      id: string;
      name: string;
      kind: "company" | "department";
    }> = [{ id: "company", name: "General", kind: "company" }];
    const myDeptId = await departmentIdOf(me.id);
    const departments = await db
      .select()
      .from(departmentsTable)
      .where(eq(departmentsTable.companyId, me.companyId))
      .orderBy(asc(departmentsTable.name));
    for (const d of departments) {
      if (me.role === "super_admin" || myDeptId === d.id) {
        groups.push({ id: `dept-${d.id}`, name: d.name, kind: "department" });
      }
    }
    res.json(groups.map((g) => ChatGroup.parse(g)));
  },
);

router.get(
  "/chat/groups/:groupId/members",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const me = req.currentUser!;
    const group = await resolveGroup(me, req.params.groupId as string);
    if (!group) {
      res.status(404).json({ error: "Group not found." });
      return;
    }
    const rows = await db
      .select({
        id: usersTable.id,
        fullName: usersTable.fullName,
        role: usersTable.role,
        departmentId: employmentInfoTable.departmentId,
      })
      .from(usersTable)
      .leftJoin(
        employmentInfoTable,
        eq(employmentInfoTable.userId, usersTable.id),
      )
      .where(eq(usersTable.companyId, me.companyId))
      .orderBy(asc(usersTable.fullName));
    const members = rows.filter(
      (u) =>
        group.departmentId === null || u.departmentId === group.departmentId,
    );
    res.json(
      members.map((m) => ChatMember.parse({ id: m.id, fullName: m.fullName })),
    );
  },
);

router.get(
  "/chat/groups/:groupId/messages",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const me = req.currentUser!;
    const group = await resolveGroup(me, req.params.groupId as string);
    if (!group) {
      res.status(404).json({ error: "Group not found." });
      return;
    }
    const scope =
      group.departmentId === null
        ? isNull(chatMessagesTable.departmentId)
        : eq(chatMessagesTable.departmentId, group.departmentId);
    const replyMsg = alias(chatMessagesTable, "reply_msg");
    const replyUser = alias(usersTable, "reply_user");
    const rows = await db
      .select({
        id: chatMessagesTable.id,
        userId: chatMessagesTable.userId,
        body: chatMessagesTable.body,
        filePath: chatMessagesTable.filePath,
        fileName: chatMessagesTable.fileName,
        mentionUserIds: chatMessagesTable.mentionUserIds,
        kind: chatMessagesTable.kind,
        replyToId: chatMessagesTable.replyToId,
        replyToBody: replyMsg.body,
        replyToFileName: replyMsg.fileName,
        replyToUserName: replyUser.fullName,
        createdAt: chatMessagesTable.createdAt,
        userName: usersTable.fullName,
      })
      .from(chatMessagesTable)
      .innerJoin(usersTable, eq(usersTable.id, chatMessagesTable.userId))
      .leftJoin(replyMsg, eq(replyMsg.id, chatMessagesTable.replyToId))
      .leftJoin(replyUser, eq(replyUser.id, replyMsg.userId))
      .where(and(eq(chatMessagesTable.companyId, me.companyId), scope))
      .orderBy(desc(chatMessagesTable.createdAt))
      .limit(200);
    rows.reverse(); // newest 200, displayed oldest-first
    res.json(
      rows.map((r) =>
        ChatMessage.parse({
          id: r.id,
          groupId: group.id,
          userId: r.userId,
          userName: r.userName,
          body: r.body,
          filePath: r.filePath,
          fileName: r.fileName,
          mentionUserIds: r.mentionUserIds,
          kind: r.kind,
          replyToId: r.replyToId,
          replyToBody:
            r.replyToId != null ? r.replyToBody || r.replyToFileName || "" : null,
          replyToUserName: r.replyToId != null ? r.replyToUserName : null,
          createdAt: r.createdAt.toISOString(),
        }),
      ),
    );
  },
);

router.post(
  "/chat/groups/:groupId/messages",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const me = req.currentUser!;
    const group = await resolveGroup(me, req.params.groupId as string);
    if (!group) {
      res.status(404).json({ error: "Group not found." });
      return;
    }
    const parsed = SendChatMessageBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid message." });
      return;
    }
    const body = parsed.data.body?.trim() || "";
    const objectPath = parsed.data.objectPath || null;
    if (!body && !objectPath) {
      res.status(400).json({ error: "Message needs text or a file." });
      return;
    }
    if (objectPath && !objectPath.startsWith("/objects/")) {
      res.status(400).json({ error: "Invalid uploaded file path." });
      return;
    }

    // Validate the replied-to message belongs to this same group.
    let replyToId: number | null = null;
    let replyPreview: { body: string; userName: string | null } | null = null;
    if (parsed.data.replyToId != null) {
      const scope =
        group.departmentId === null
          ? isNull(chatMessagesTable.departmentId)
          : eq(chatMessagesTable.departmentId, group.departmentId);
      const [target] = await db
        .select({
          id: chatMessagesTable.id,
          body: chatMessagesTable.body,
          fileName: chatMessagesTable.fileName,
          userName: usersTable.fullName,
        })
        .from(chatMessagesTable)
        .innerJoin(usersTable, eq(usersTable.id, chatMessagesTable.userId))
        .where(
          and(
            eq(chatMessagesTable.id, parsed.data.replyToId),
            eq(chatMessagesTable.companyId, me.companyId),
            scope,
          ),
        );
      if (!target) {
        res.status(400).json({ error: "Replied-to message not found." });
        return;
      }
      replyToId = target.id;
      replyPreview = {
        body: target.body || target.fileName || "",
        userName: target.userName,
      };
    }

    // Group members (used for @all and mention validation): company group =
    // everyone in the company; department group = only users in that dept.
    const allMembers = await db
      .select({
        id: usersTable.id,
        departmentId: employmentInfoTable.departmentId,
      })
      .from(usersTable)
      .leftJoin(
        employmentInfoTable,
        eq(employmentInfoTable.userId, usersTable.id),
      )
      .where(eq(usersTable.companyId, me.companyId));
    const memberIds = new Set(
      allMembers
        .filter(
          (u) =>
            group.departmentId === null ||
            u.departmentId === group.departmentId,
        )
        .map((u) => u.id),
    );

    const mentionAll = parsed.data.mentionAll === true;
    let mentionIds: number[];
    if (mentionAll) {
      mentionIds = [...memberIds];
    } else {
      const requested = [...new Set(parsed.data.mentionUserIds || [])];
      mentionIds = requested.filter((id) => memberIds.has(id));
    }

    const [inserted] = await db
      .insert(chatMessagesTable)
      .values({
        companyId: me.companyId,
        departmentId: group.departmentId,
        userId: me.id,
        body,
        filePath: objectPath,
        fileName: objectPath ? parsed.data.fileName || "file" : null,
        mentionUserIds: mentionIds,
        replyToId,
        kind: parsed.data.kind === "voice" ? "voice" : "text",
      })
      .returning();

    const link = `chat?group=${group.id}`;

    // Push a phone notification for every new message to the other group
    // members (mentioned members get a richer mention notification below).
    const mentionSet = new Set(mentionIds);
    const preview =
      body ||
      (parsed.data.kind === "voice"
        ? "Voice note"
        : inserted.fileName || "Attachment");
    for (const uid of memberIds) {
      if (uid === me.id || mentionSet.has(uid)) continue;
      void sendPush(
        me.companyId,
        `${me.fullName} in "${group.name}": ${preview}`,
        uid,
      );
    }

    for (const uid of mentionIds) {
      if (uid === me.id) continue;
      void notify(
        me.companyId,
        "chat_mention",
        mentionAll
          ? `${me.fullName} mentioned everyone in the "${group.name}" chat.`
          : `${me.fullName} mentioned you in the "${group.name}" chat.`,
        uid,
        link,
      );
    }

    res.json(
      ChatMessage.parse({
        id: inserted.id,
        groupId: group.id,
        userId: me.id,
        userName: me.fullName,
        body: inserted.body,
        filePath: inserted.filePath,
        fileName: inserted.fileName,
        mentionUserIds: inserted.mentionUserIds,
        kind: inserted.kind,
        replyToId,
        replyToBody: replyPreview ? replyPreview.body : null,
        replyToUserName: replyPreview ? replyPreview.userName : null,
        createdAt: inserted.createdAt.toISOString(),
      }),
    );
  },
);

// Delete a message: the sender can delete their own; management can delete any
// message in a group they have access to.
router.delete(
  "/chat/groups/:groupId/messages/:messageId",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const me = req.currentUser!;
    const group = await resolveGroup(me, req.params.groupId as string);
    if (!group) {
      res.status(404).json({ error: "Group not found." });
      return;
    }
    const messageId = Number(req.params.messageId);
    const scope =
      group.departmentId === null
        ? isNull(chatMessagesTable.departmentId)
        : eq(chatMessagesTable.departmentId, group.departmentId);
    const [msg] = await db
      .select({ id: chatMessagesTable.id, userId: chatMessagesTable.userId })
      .from(chatMessagesTable)
      .where(
        and(
          eq(chatMessagesTable.id, messageId),
          eq(chatMessagesTable.companyId, me.companyId),
          scope,
        ),
      );
    if (!msg) {
      res.status(404).json({ error: "Message not found." });
      return;
    }
    const isManagement = me.role !== "employee";
    if (msg.userId !== me.id && !isManagement) {
      res.status(404).json({ error: "Message not found." });
      return;
    }
    await db.delete(chatMessagesTable).where(eq(chatMessagesTable.id, msg.id));
    res.json(DeleteChatMessageResponse.parse({ ok: true }));
  },
);

export default router;
