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
import { requireAuth } from "../lib/auth";
import { notify } from "../lib/notify";

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
// - a department group is open to that department's employees and to
//   management users (super_admin / hr)
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
  const isManagement = me.role !== "employee";
  if (!isManagement && (await departmentIdOf(me.id)) !== dept.id) return null;
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
    const isManagement = me.role !== "employee";
    const myDeptId = isManagement ? null : await departmentIdOf(me.id);
    const departments = await db
      .select()
      .from(departmentsTable)
      .where(eq(departmentsTable.companyId, me.companyId))
      .orderBy(asc(departmentsTable.name));
    for (const d of departments) {
      if (isManagement || myDeptId === d.id) {
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
        group.departmentId === null ||
        u.departmentId === group.departmentId ||
        u.role !== "employee",
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
    const rows = await db
      .select({
        id: chatMessagesTable.id,
        userId: chatMessagesTable.userId,
        body: chatMessagesTable.body,
        filePath: chatMessagesTable.filePath,
        fileName: chatMessagesTable.fileName,
        mentionUserIds: chatMessagesTable.mentionUserIds,
        createdAt: chatMessagesTable.createdAt,
        userName: usersTable.fullName,
      })
      .from(chatMessagesTable)
      .innerJoin(usersTable, eq(usersTable.id, chatMessagesTable.userId))
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

    // Only allow tagging users who are actually members of this group:
    // company group = everyone in the company; department group = that
    // department's employees plus management users.
    let mentionIds: number[] = [];
    const requested = [...new Set(parsed.data.mentionUserIds || [])];
    if (requested.length) {
      const valid = await db
        .select({
          id: usersTable.id,
          role: usersTable.role,
          departmentId: employmentInfoTable.departmentId,
        })
        .from(usersTable)
        .leftJoin(
          employmentInfoTable,
          eq(employmentInfoTable.userId, usersTable.id),
        )
        .where(
          and(
            eq(usersTable.companyId, me.companyId),
            inArray(usersTable.id, requested),
          ),
        );
      mentionIds = valid
        .filter(
          (u) =>
            group.departmentId === null ||
            u.departmentId === group.departmentId ||
            u.role !== "employee",
        )
        .map((v) => v.id);
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
      })
      .returning();

    for (const uid of mentionIds) {
      if (uid === me.id) continue;
      void notify(
        me.companyId,
        "chat_mention",
        `${me.fullName} mentioned you in the "${group.name}" chat.`,
        uid,
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
        createdAt: inserted.createdAt.toISOString(),
      }),
    );
  },
);

export default router;
