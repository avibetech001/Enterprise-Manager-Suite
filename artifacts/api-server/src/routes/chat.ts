import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import {
  db,
  chatMessagesTable,
  chatMessageReadReceiptsTable,
  chatTeamsTable,
  chatTeamMembersTable,
  chatConversationsTable,
  chatConversationParticipantsTable,
  directChatMessagesTable,
  directChatMessageReadReceiptsTable,
  departmentsTable,
  employmentInfoTable,
  userPresenceTable,
  usersTable,
} from "@workspace/db";
import {
  HeartbeatChatPresenceResponse,
  SendChatMessageBody,
  ListChatGroupsResponseItem as ChatGroup,
  ListChatGroupMembersResponseItem as ChatMember,
  ListChatMessagesResponseItem as ChatMessage,
  ListPrivateChatContactsResponseItem as PrivateEmployee,
  ListPrivateConversationsResponseItem as PrivateConversation,
  CreatePrivateConversationBody,
  ListTeamChatEmployeesResponse,
  ListManagedChatTeamsResponseItem,
  CreateManagedChatTeamBody,
  CreateManagedChatTeamResponse,
  UpdateManagedChatTeamBody,
  UpdateManagedChatTeamResponse,
} from "@workspace/api-zod";
import {
  DeleteChatMessageResponse,
} from "@workspace/api-zod";
import { alias } from "drizzle-orm/pg-core";
import { requireAuth, requireManagementPermission } from "../lib/auth";
import {
  canAccessPrivateConversation,
  canonicalPrivatePair,
  findOrCreatePrivateConversation,
} from "../lib/chatAccess";
import { notify } from "../lib/notify";
import { sendPush } from "../lib/push";

const router: IRouter = Router();

type CurrentUser = NonNullable<Request["currentUser"]>;
const ONLINE_WINDOW_MS = 90_000;
const managedTeamLead = alias(usersTable, "managed_team_lead");

function canManageTeamChats(user: CurrentUser): boolean {
  return (
    user.role === "super_admin" ||
    (user.role === "hr" && user.permissions.includes("manage_departments"))
  );
}

async function managedTeamResponse(teamId: number, companyId: number) {
  const [team] = await db
    .select({
      id: chatTeamsTable.id,
      name: chatTeamsTable.name,
      description: chatTeamsTable.description,
      teamLeadUserId: chatTeamsTable.teamLeadUserId,
      teamLeadName: managedTeamLead.fullName,
      createdAt: chatTeamsTable.createdAt,
    })
    .from(chatTeamsTable)
    .leftJoin(
      managedTeamLead,
      eq(managedTeamLead.id, chatTeamsTable.teamLeadUserId),
    )
    .where(
      and(
        eq(chatTeamsTable.id, teamId),
        eq(chatTeamsTable.companyId, companyId),
      ),
    );
  if (!team) return null;
  const members = await db
    .select({ userId: chatTeamMembersTable.userId })
    .from(chatTeamMembersTable)
    .innerJoin(usersTable, eq(usersTable.id, chatTeamMembersTable.userId))
    .where(
      and(
        eq(chatTeamMembersTable.teamId, teamId),
        eq(usersTable.companyId, companyId),
        eq(usersTable.role, "employee"),
        eq(usersTable.status, "active"),
        eq(usersTable.archived, false),
      ),
    );
  return ListManagedChatTeamsResponseItem.parse({
    ...team,
    teamLeadUserId: team.teamLeadUserId,
    teamLeadName: team.teamLeadName,
    memberUserIds: members.map((member) => member.userId),
    createdAt: team.createdAt.toISOString(),
  });
}

async function validateManagedTeamMembers(
  companyId: number,
  rawUserIds: number[],
  teamLeadUserId: number,
): Promise<number[] | null> {
  const memberUserIds = [...new Set(rawUserIds)];
  if (memberUserIds.length === 0 || !memberUserIds.includes(teamLeadUserId)) {
    return null;
  }
  const activeEmployees = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(
      and(
        eq(usersTable.companyId, companyId),
        eq(usersTable.role, "employee"),
        eq(usersTable.status, "active"),
        eq(usersTable.archived, false),
        inArray(usersTable.id, memberUserIds),
      ),
    );
  if (activeEmployees.length !== memberUserIds.length) return null;
  return memberUserIds;
}

router.get(
  "/chat/team-members",
  requireAuth,
  requireManagementPermission("manage_departments"),
  async (req: Request, res: Response): Promise<void> => {
    const employees = await db
      .select({
        id: usersTable.id,
        fullName: usersTable.fullName,
        employeeCode: usersTable.employeeCode,
      })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.companyId, req.currentUser!.companyId),
          eq(usersTable.role, "employee"),
          eq(usersTable.status, "active"),
          eq(usersTable.archived, false),
        ),
      )
      .orderBy(asc(usersTable.fullName));
    res.json(ListTeamChatEmployeesResponse.parse(employees));
  },
);

async function presenceByUserId(
  companyId: number,
  userIds: number[],
): Promise<Map<number, Date>> {
  if (userIds.length === 0) return new Map();
  const rows = await db
    .select({
      userId: userPresenceTable.userId,
      lastSeenAt: userPresenceTable.lastSeenAt,
    })
    .from(userPresenceTable)
    .where(
      and(
        eq(userPresenceTable.companyId, companyId),
        inArray(userPresenceTable.userId, userIds),
      ),
    );
  return new Map(rows.map((row) => [row.userId, row.lastSeenAt]));
}

function presenceFields(userId: number, presence: Map<number, Date>) {
  const lastSeenAt = presence.get(userId) ?? null;
  return {
    isOnline:
      lastSeenAt !== null &&
      Date.now() - lastSeenAt.getTime() <= ONLINE_WINDOW_MS,
    lastSeenAt: lastSeenAt?.toISOString() ?? null,
  };
}

async function recordGroupMessageReads(
  userId: number,
  rows: Array<{ id: number; userId: number }>,
): Promise<Map<number, string[]>> {
  const messageIds = rows.map((row) => row.id);
  if (messageIds.length === 0) return new Map();
  const unreadMessages = rows.filter((row) => row.userId !== userId);
  if (unreadMessages.length > 0) {
    await db
      .insert(chatMessageReadReceiptsTable)
      .values(
        unreadMessages.map((row) => ({
          messageId: row.id,
          userId,
        })),
      )
      .onConflictDoNothing();
  }
  const receipts = await db
    .select({
      messageId: chatMessageReadReceiptsTable.messageId,
      fullName: usersTable.fullName,
    })
    .from(chatMessageReadReceiptsTable)
    .innerJoin(
      usersTable,
      eq(usersTable.id, chatMessageReadReceiptsTable.userId),
    )
    .where(
      and(
        inArray(chatMessageReadReceiptsTable.messageId, messageIds),
        eq(usersTable.status, "active"),
        eq(usersTable.archived, false),
      ),
    )
    .orderBy(asc(usersTable.fullName));
  const names = new Map<number, string[]>();
  for (const receipt of receipts) {
    const viewers = names.get(receipt.messageId) ?? [];
    viewers.push(receipt.fullName);
    names.set(receipt.messageId, viewers);
  }
  return names;
}

async function recordPrivateMessageReads(
  userId: number,
  rows: Array<{ id: number; userId: number }>,
): Promise<Map<number, string[]>> {
  const messageIds = rows.map((row) => row.id);
  if (messageIds.length === 0) return new Map();
  const unreadMessages = rows.filter((row) => row.userId !== userId);
  if (unreadMessages.length > 0) {
    await db
      .insert(directChatMessageReadReceiptsTable)
      .values(
        unreadMessages.map((row) => ({
          messageId: row.id,
          userId,
        })),
      )
      .onConflictDoNothing();
  }
  const receipts = await db
    .select({
      messageId: directChatMessageReadReceiptsTable.messageId,
      fullName: usersTable.fullName,
    })
    .from(directChatMessageReadReceiptsTable)
    .innerJoin(
      usersTable,
      eq(usersTable.id, directChatMessageReadReceiptsTable.userId),
    )
    .where(
      and(
        inArray(directChatMessageReadReceiptsTable.messageId, messageIds),
        eq(usersTable.status, "active"),
        eq(usersTable.archived, false),
      ),
    )
    .orderBy(asc(usersTable.fullName));
  const names = new Map<number, string[]>();
  for (const receipt of receipts) {
    const viewers = names.get(receipt.messageId) ?? [];
    viewers.push(receipt.fullName);
    names.set(receipt.messageId, viewers);
  }
  return names;
}

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

router.post(
  "/chat/presence/heartbeat",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const me = req.currentUser!;
    const lastSeenAt = new Date();
    await db
      .insert(userPresenceTable)
      .values({
        userId: me.id,
        companyId: me.companyId,
        lastSeenAt,
      })
      .onConflictDoUpdate({
        target: userPresenceTable.userId,
        set: { companyId: me.companyId, lastSeenAt },
      });
    res.json(
      HeartbeatChatPresenceResponse.parse({
        lastSeenAt: lastSeenAt.toISOString(),
      }),
    );
  },
);

router.get(
  "/chat/teams",
  requireAuth,
  requireManagementPermission("manage_departments"),
  async (req: Request, res: Response): Promise<void> => {
    const me = req.currentUser!;
    const teams = await db
      .select({ id: chatTeamsTable.id })
      .from(chatTeamsTable)
      .where(eq(chatTeamsTable.companyId, me.companyId))
      .orderBy(asc(chatTeamsTable.name));
    const results = await Promise.all(
      teams.map((team) => managedTeamResponse(team.id, me.companyId)),
    );
    res.json(results.filter((team) => team !== null));
  },
);

router.post(
  "/chat/teams",
  requireAuth,
  requireManagementPermission("manage_departments"),
  async (req: Request, res: Response): Promise<void> => {
    const me = req.currentUser!;
    const parsed = CreateManagedChatTeamBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Enter a team name, members, and lead." });
      return;
    }
    const name = parsed.data.name.trim();
    if (!name) {
      res.status(400).json({ error: "Team name is required." });
      return;
    }
    const memberUserIds = await validateManagedTeamMembers(
      me.companyId,
      parsed.data.memberUserIds,
      parsed.data.teamLeadUserId,
    );
    if (!memberUserIds) {
      res.status(400).json({
        error: "The Team Lead must be an active employee included in the team.",
      });
      return;
    }
    const [existing] = await db
      .select({ id: chatTeamsTable.id })
      .from(chatTeamsTable)
      .where(
        and(
          eq(chatTeamsTable.companyId, me.companyId),
          eq(chatTeamsTable.name, name),
        ),
      );
    if (existing) {
      res.status(409).json({ error: "A team chat with that name already exists." });
      return;
    }
    const teamId = await db.transaction(async (tx) => {
      const [team] = await tx
        .insert(chatTeamsTable)
        .values({
          companyId: me.companyId,
          name,
          description: parsed.data.description?.trim() ?? "",
          teamLeadUserId: parsed.data.teamLeadUserId,
        })
        .returning({ id: chatTeamsTable.id });
      if (!team) return null;
      await tx.insert(chatTeamMembersTable).values(
        memberUserIds.map((userId) => ({ teamId: team.id, userId })),
      );
      return team.id;
    });
    if (teamId === null) {
      res.status(500).json({ error: "Could not create the team chat." });
      return;
    }
    const result = await managedTeamResponse(teamId, me.companyId);
    res.status(201).json(CreateManagedChatTeamResponse.parse(result));
  },
);

router.patch(
  "/chat/teams/:teamId",
  requireAuth,
  requireManagementPermission("manage_departments"),
  async (req: Request, res: Response): Promise<void> => {
    const me = req.currentUser!;
    const teamId = Number(req.params.teamId);
    if (!Number.isSafeInteger(teamId) || teamId < 1) {
      res.status(400).json({ error: "Invalid team ID." });
      return;
    }
    const parsed = UpdateManagedChatTeamBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Enter a team name, members, and lead." });
      return;
    }
    const name = parsed.data.name.trim();
    if (!name) {
      res.status(400).json({ error: "Team name is required." });
      return;
    }
    const [existingTeam] = await db
      .select({ id: chatTeamsTable.id })
      .from(chatTeamsTable)
      .where(
        and(
          eq(chatTeamsTable.id, teamId),
          eq(chatTeamsTable.companyId, me.companyId),
        ),
      );
    if (!existingTeam) {
      res.status(404).json({ error: "Team chat not found." });
      return;
    }
    const memberUserIds = await validateManagedTeamMembers(
      me.companyId,
      parsed.data.memberUserIds,
      parsed.data.teamLeadUserId,
    );
    if (!memberUserIds) {
      res.status(400).json({
        error: "The Team Lead must be an active employee included in the team.",
      });
      return;
    }
    const [duplicate] = await db
      .select({ id: chatTeamsTable.id })
      .from(chatTeamsTable)
      .where(
        and(
          eq(chatTeamsTable.companyId, me.companyId),
          eq(chatTeamsTable.name, name),
        ),
      );
    if (duplicate && duplicate.id !== teamId) {
      res.status(409).json({ error: "A team chat with that name already exists." });
      return;
    }
    await db.transaction(async (tx) => {
      await tx
        .update(chatTeamsTable)
        .set({
          name,
          description: parsed.data.description?.trim() ?? "",
          teamLeadUserId: parsed.data.teamLeadUserId,
        })
        .where(
          and(
            eq(chatTeamsTable.id, teamId),
            eq(chatTeamsTable.companyId, me.companyId),
          ),
        );
      await tx
        .delete(chatTeamMembersTable)
        .where(eq(chatTeamMembersTable.teamId, teamId));
      await tx.insert(chatTeamMembersTable).values(
        memberUserIds.map((userId) => ({ teamId, userId })),
      );
    });
    const result = await managedTeamResponse(teamId, me.companyId);
    if (!result) {
      res.status(404).json({ error: "Team chat not found." });
      return;
    }
    res.json(UpdateManagedChatTeamResponse.parse(result));
  },
);

router.delete(
  "/chat/teams/:teamId",
  requireAuth,
  requireManagementPermission("manage_departments"),
  async (req: Request, res: Response): Promise<void> => {
    const me = req.currentUser!;
    const teamId = Number(req.params.teamId);
    if (!Number.isSafeInteger(teamId) || teamId < 1) {
      res.status(400).json({ error: "Invalid team ID." });
      return;
    }
    const [team] = await db
      .select({ id: chatTeamsTable.id })
      .from(chatTeamsTable)
      .where(
        and(
          eq(chatTeamsTable.id, teamId),
          eq(chatTeamsTable.companyId, me.companyId),
        ),
      );
    if (!team) {
      res.status(404).json({ error: "Team chat not found." });
      return;
    }
    const teamKey = `managed-team:${teamId}`;
    const deleted = await db.transaction(async (tx) => {
      await tx
        .delete(chatMessagesTable)
        .where(
          and(
            eq(chatMessagesTable.companyId, me.companyId),
            eq(chatMessagesTable.teamKey, teamKey),
          ),
        );
      return tx
        .delete(chatTeamsTable)
        .where(
          and(
            eq(chatTeamsTable.id, teamId),
            eq(chatTeamsTable.companyId, me.companyId),
          ),
        )
        .returning({ id: chatTeamsTable.id });
    });
    if (deleted.length === 0) {
      res.status(404).json({ error: "Team chat not found." });
      return;
    }
    res.sendStatus(204);
  },
);

interface ResolvedGroup {
  id: string;
  name: string;
  departmentId: number | null;
  teamKey: string | null;
  managedTeamId?: number;
  memberUserIds?: number[];
}

function groupMessageScope(group: ResolvedGroup) {
  return and(
    group.departmentId === null
      ? isNull(chatMessagesTable.departmentId)
      : eq(chatMessagesTable.departmentId, group.departmentId),
    group.teamKey === null
      ? isNull(chatMessagesTable.teamKey)
      : eq(chatMessagesTable.teamKey, group.teamKey),
  );
}

// Resolve a group id ("company" or "dept-<id>") and enforce access:
// - the company group is open to every user in the company
// - a department group is open only to users assigned to that department
async function resolveGroup(
  me: CurrentUser,
  groupId: string,
): Promise<ResolvedGroup | null> {
  if (groupId === "company") {
    return { id: "company", name: "General", departmentId: null, teamKey: null };
  }
  const managedTeamMatch = /^custom-team-(\d+)$/.exec(groupId);
  if (managedTeamMatch) {
    const managedTeamId = Number(managedTeamMatch[1]);
    const [team] = await db
      .select({
        id: chatTeamsTable.id,
        name: chatTeamsTable.name,
        teamLeadUserId: chatTeamsTable.teamLeadUserId,
      })
      .from(chatTeamsTable)
      .where(
        and(
          eq(chatTeamsTable.id, managedTeamId),
          eq(chatTeamsTable.companyId, me.companyId),
        ),
      );
    if (!team) return null;
    const memberRows = await db
      .select({ userId: chatTeamMembersTable.userId })
      .from(chatTeamMembersTable)
      .innerJoin(usersTable, eq(usersTable.id, chatTeamMembersTable.userId))
      .where(
        and(
          eq(chatTeamMembersTable.teamId, team.id),
          eq(usersTable.companyId, me.companyId),
          eq(usersTable.role, "employee"),
          eq(usersTable.status, "active"),
          eq(usersTable.archived, false),
        ),
      );
    const memberUserIds = memberRows.map((row) => row.userId);
    if (!memberUserIds.includes(me.id) && !canManageTeamChats(me)) return null;
    return {
      id: groupId,
      name: team.name,
      departmentId: null,
      teamKey: `managed-team:${team.id}`,
      managedTeamId: team.id,
      memberUserIds,
    };
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
  return { id: groupId, name: dept.name, departmentId: dept.id, teamKey: null };
}

router.get(
  "/chat/groups",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const me = req.currentUser!;
    const groups: Array<{
      id: string;
      name: string;
      kind: "company" | "department" | "team";
      teamLeadUserId: number | null;
      teamLeadName: string | null;
    }> = [{
      id: "company",
      name: "General",
      kind: "company",
      teamLeadUserId: null,
      teamLeadName: null,
    }];
    const myDeptId = await departmentIdOf(me.id);
    const departments = await db
      .select()
      .from(departmentsTable)
      .where(eq(departmentsTable.companyId, me.companyId))
      .orderBy(asc(departmentsTable.name));
    for (const d of departments) {
      if (me.role === "super_admin" || myDeptId === d.id) {
        groups.push({
          id: `dept-${d.id}`,
          name: d.name,
          kind: "department",
          teamLeadUserId: null,
          teamLeadName: null,
        });
      }
    }
    const managedTeams = await db
      .select({
        id: chatTeamsTable.id,
        name: chatTeamsTable.name,
        teamLeadUserId: chatTeamsTable.teamLeadUserId,
        teamLeadName: managedTeamLead.fullName,
      })
      .from(chatTeamsTable)
      .leftJoin(
        managedTeamLead,
        eq(managedTeamLead.id, chatTeamsTable.teamLeadUserId),
      )
      .where(eq(chatTeamsTable.companyId, me.companyId))
      .orderBy(asc(chatTeamsTable.name));
    const myTeamRows = await db
      .select({ teamId: chatTeamMembersTable.teamId })
      .from(chatTeamMembersTable)
      .where(eq(chatTeamMembersTable.userId, me.id));
    const myTeamIds = new Set(myTeamRows.map((row) => row.teamId));
    for (const team of managedTeams) {
      if (!canManageTeamChats(me) && !myTeamIds.has(team.id)) continue;
      groups.push({
        id: `custom-team-${team.id}`,
        name: team.name,
        kind: "team",
        teamLeadUserId: team.teamLeadUserId,
        teamLeadName: team.teamLeadName,
      });
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
      .where(
        and(
          eq(usersTable.companyId, me.companyId),
          eq(usersTable.status, "active"),
          eq(usersTable.archived, false),
        ),
      )
      .orderBy(asc(usersTable.fullName));
    const teamMemberIds = group.managedTeamId
      ? new Set(group.memberUserIds ?? [])
      : null;
    const members = rows.filter((u) =>
      teamMemberIds
        ? teamMemberIds.has(u.id) || (me.role === "super_admin" && u.id === me.id)
        : group.departmentId === null || u.departmentId === group.departmentId,
    );
    const presence = await presenceByUserId(
      me.companyId,
      members.map((member) => member.id),
    );
    res.json(
      members.map((m) =>
        ChatMember.parse({
          id: m.id,
          fullName: m.fullName,
          ...presenceFields(m.id, presence),
        }),
      ),
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
    const scope = groupMessageScope(group);
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
    const readByNames = await recordGroupMessageReads(me.id, rows);
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
          readByNames: readByNames.get(r.id) ?? [],
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
      const scope = groupMessageScope(group);
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
      .where(
        and(
          eq(usersTable.companyId, me.companyId),
          eq(usersTable.status, "active"),
          eq(usersTable.archived, false),
        ),
      );
    const teamIds = group.managedTeamId
      ? new Set(group.memberUserIds ?? [])
      : null;
    const memberIds = new Set(
      allMembers
        .filter((u) =>
          teamIds
            ? teamIds.has(u.id)
            : group.departmentId === null || u.departmentId === group.departmentId,
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
        teamKey: group.teamKey,
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
        readByNames: [],
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
    const scope = groupMessageScope(group);
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

async function privateConversationFor(
  me: CurrentUser,
  conversationId: number,
) {
  const participants = await db
    .select({
      conversationId: chatConversationParticipantsTable.conversationId,
      companyId: chatConversationsTable.companyId,
      userId: chatConversationParticipantsTable.userId,
    })
    .from(chatConversationParticipantsTable)
    .innerJoin(
      chatConversationsTable,
      eq(chatConversationsTable.id, chatConversationParticipantsTable.conversationId),
    )
    .where(
      eq(chatConversationParticipantsTable.conversationId, conversationId),
    );
  return canAccessPrivateConversation(
    me,
    participants[0]?.companyId ?? -1,
    participants.map((participant) => participant.userId),
  )
    ? participants[0] ?? null
    : null;
}

router.get(
  "/chat/private/contacts",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const me = req.currentUser!;
    const contacts = await db
      .select({ id: usersTable.id, fullName: usersTable.fullName })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.companyId, me.companyId),
          eq(usersTable.status, "active"),
          eq(usersTable.archived, false),
          // A user cannot open a private thread with themselves.
          // The exclusion is applied after the query to keep the schema's
          // integer comparison portable across supported SQL adapters.
        ),
      )
      .orderBy(asc(usersTable.fullName));
    const visibleContacts = contacts.filter((contact) => contact.id !== me.id);
    const presence = await presenceByUserId(
      me.companyId,
      visibleContacts.map((contact) => contact.id),
    );
    res.json(
      visibleContacts.map((contact) =>
        PrivateEmployee.parse({
          ...contact,
          ...presenceFields(contact.id, presence),
        }),
      ),
    );
  },
);

router.get(
  "/chat/private/conversations",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const me = req.currentUser!;
    const mine = await db
      .select({ conversationId: chatConversationParticipantsTable.conversationId })
      .from(chatConversationParticipantsTable)
      .where(eq(chatConversationParticipantsTable.userId, me.id));
    if (mine.length === 0) {
      res.json([]);
      return;
    }
    const conversations = await db
      .select()
      .from(chatConversationsTable)
      .where(
        and(
          eq(chatConversationsTable.companyId, me.companyId),
          inArray(chatConversationsTable.id, mine.map((row) => row.conversationId)),
        ),
      )
      .orderBy(desc(chatConversationsTable.createdAt));
    const participantRows = await db
      .select({
        conversationId: chatConversationParticipantsTable.conversationId,
        userId: usersTable.id,
        fullName: usersTable.fullName,
      })
      .from(chatConversationParticipantsTable)
      .innerJoin(usersTable, eq(usersTable.id, chatConversationParticipantsTable.userId))
      .where(inArray(chatConversationParticipantsTable.conversationId, conversations.map((c) => c.id)));
    const otherUsers = participantRows.filter((row) => row.userId !== me.id);
    const presence = await presenceByUserId(
      me.companyId,
      otherUsers.map((user) => user.userId),
    );
    res.json(
      conversations.map((conversation) => {
        const other = participantRows.find(
          (row) => row.conversationId === conversation.id && row.userId !== me.id,
        );
        if (!other) return null;
        return PrivateConversation.parse({
          id: conversation.id,
          otherUserId: other.userId,
          otherUserName: other.fullName,
          createdAt: conversation.createdAt.toISOString(),
          ...presenceFields(other.userId, presence),
        });
      }).filter((conversation): conversation is NonNullable<typeof conversation> => conversation !== null),
    );
  },
);

router.post(
  "/chat/private/conversations",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const me = req.currentUser!;
    const parsed = CreatePrivateConversationBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid coworker." });
      return;
    }
    const [recipient] = await db
      .select({ id: usersTable.id, fullName: usersTable.fullName })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.id, parsed.data.recipientUserId),
          eq(usersTable.companyId, me.companyId),
          eq(usersTable.status, "active"),
          eq(usersTable.archived, false),
        ),
      );
    if (!recipient || recipient.id === me.id) {
      res.status(400).json({ error: "Choose another active coworker." });
      return;
    }
    const [firstUserId, secondUserId] = canonicalPrivatePair(me.id, recipient.id);
    const findExisting = async () => {
      const [existing] = await db
        .select()
        .from(chatConversationsTable)
        .where(
          and(
            eq(chatConversationsTable.companyId, me.companyId),
            eq(chatConversationsTable.initiatedByUserId, firstUserId),
            eq(chatConversationsTable.employeeUserId, secondUserId),
          ),
        );
      return existing ?? null;
    };
    const conversation = await findOrCreatePrivateConversation(
      findExisting,
      () => db.transaction(async (tx) => {
        const [created] = await tx
          .insert(chatConversationsTable)
          .values({
            companyId: me.companyId,
            initiatedByUserId: firstUserId,
            employeeUserId: secondUserId,
          })
          .onConflictDoNothing()
          .returning();
        if (created) {
          await tx.insert(chatConversationParticipantsTable).values([
            { conversationId: created.id, userId: me.id },
            { conversationId: created.id, userId: recipient.id },
          ]);
          return created;
        }
        return null;
      }),
    );
    if (!conversation) {
      res.status(500).json({ error: "Could not open the private conversation." });
      return;
    }
    const presence = await presenceByUserId(me.companyId, [recipient.id]);
    res.json(PrivateConversation.parse({
      id: conversation.id,
      otherUserId: recipient.id,
      otherUserName: recipient.fullName,
      createdAt: conversation.createdAt.toISOString(),
      ...presenceFields(recipient.id, presence),
    }));
  },
);

async function privateMessageRows(conversationId: number) {
  const replyMsg = alias(directChatMessagesTable, "direct_reply_msg");
  const replyUser = alias(usersTable, "direct_reply_user");
  const rows = await db
    .select({
      id: directChatMessagesTable.id,
      userId: directChatMessagesTable.userId,
      body: directChatMessagesTable.body,
      filePath: directChatMessagesTable.filePath,
      fileName: directChatMessagesTable.fileName,
      kind: directChatMessagesTable.kind,
      replyToId: directChatMessagesTable.replyToId,
      replyToBody: replyMsg.body,
      replyToFileName: replyMsg.fileName,
      replyToUserName: replyUser.fullName,
      createdAt: directChatMessagesTable.createdAt,
      userName: usersTable.fullName,
    })
    .from(directChatMessagesTable)
    .innerJoin(usersTable, eq(usersTable.id, directChatMessagesTable.userId))
    .leftJoin(replyMsg, eq(replyMsg.id, directChatMessagesTable.replyToId))
    .leftJoin(replyUser, eq(replyUser.id, replyMsg.userId))
    .where(eq(directChatMessagesTable.conversationId, conversationId))
    .orderBy(desc(directChatMessagesTable.createdAt))
    .limit(200);
  return rows.reverse();
}

router.get(
  "/chat/private/conversations/:conversationId/messages",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const me = req.currentUser!;
    const conversationId = Number(req.params.conversationId);
    if (!Number.isInteger(conversationId) || !(await privateConversationFor(me, conversationId))) {
      res.status(404).json({ error: "Conversation not found." });
      return;
    }
    const rows = await privateMessageRows(conversationId);
    const readByNames = await recordPrivateMessageReads(me.id, rows);
    res.json(rows.map((row) => ChatMessage.parse({
      ...row,
      groupId: `dm-${conversationId}`,
      mentionUserIds: [],
      readByNames: readByNames.get(row.id) ?? [],
      replyToBody: row.replyToId != null ? row.replyToBody || row.replyToFileName || "" : null,
      replyToUserName: row.replyToId != null ? row.replyToUserName : null,
      createdAt: row.createdAt.toISOString(),
    })));
  },
);

router.post(
  "/chat/private/conversations/:conversationId/messages",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const me = req.currentUser!;
    const conversationId = Number(req.params.conversationId);
    if (!Number.isInteger(conversationId) || !(await privateConversationFor(me, conversationId))) {
      res.status(404).json({ error: "Conversation not found." });
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
    let replyToId: number | null = null;
    let replyPreview: { body: string; userName: string } | null = null;
    if (parsed.data.replyToId != null) {
      const [reply] = await db
        .select({
          id: directChatMessagesTable.id,
          body: directChatMessagesTable.body,
          fileName: directChatMessagesTable.fileName,
          userName: usersTable.fullName,
        })
        .from(directChatMessagesTable)
        .innerJoin(usersTable, eq(usersTable.id, directChatMessagesTable.userId))
        .where(and(
          eq(directChatMessagesTable.id, parsed.data.replyToId),
          eq(directChatMessagesTable.conversationId, conversationId),
        ));
      if (!reply) {
        res.status(400).json({ error: "Replied-to message not found." });
        return;
      }
      replyToId = reply.id;
      replyPreview = { body: reply.body || reply.fileName || "", userName: reply.userName };
    }
    const [inserted] = await db.insert(directChatMessagesTable).values({
      conversationId,
      userId: me.id,
      body,
      filePath: objectPath,
      fileName: objectPath ? parsed.data.fileName || "file" : null,
      replyToId,
      kind: parsed.data.kind === "voice" ? "voice" : "text",
    }).returning();
    const participants = await db
      .select({ userId: chatConversationParticipantsTable.userId })
      .from(chatConversationParticipantsTable)
      .where(eq(chatConversationParticipantsTable.conversationId, conversationId));
    const recipient = participants.find((row) => row.userId !== me.id);
    const preview = body || (inserted.kind === "voice" ? "Voice note" : inserted.fileName || "Attachment");
    if (recipient) {
      void notify(
        me.companyId,
        "chat_direct",
        `${me.fullName} sent you a private message: ${preview}`,
        recipient.userId,
        `chat?conversation=${conversationId}`,
      );
      void sendPush(me.companyId, `${me.fullName}: ${preview}`, recipient.userId);
    }
    res.json(ChatMessage.parse({
      id: inserted.id,
      groupId: `dm-${conversationId}`,
      userId: me.id,
      userName: me.fullName,
      body: inserted.body,
      filePath: inserted.filePath,
      fileName: inserted.fileName,
      mentionUserIds: [],
      readByNames: [],
      kind: inserted.kind,
      replyToId,
      replyToBody: replyPreview?.body ?? null,
      replyToUserName: replyPreview?.userName ?? null,
      createdAt: inserted.createdAt.toISOString(),
    }));
  },
);

router.delete(
  "/chat/private/conversations/:conversationId/messages/:messageId",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const me = req.currentUser!;
    const conversationId = Number(req.params.conversationId);
    const messageId = Number(req.params.messageId);
    if (!Number.isInteger(conversationId) || !(await privateConversationFor(me, conversationId))) {
      res.status(404).json({ error: "Conversation not found." });
      return;
    }
    const [message] = await db
      .select({ id: directChatMessagesTable.id })
      .from(directChatMessagesTable)
      .where(and(
        eq(directChatMessagesTable.id, messageId),
        eq(directChatMessagesTable.conversationId, conversationId),
        eq(directChatMessagesTable.userId, me.id),
      ));
    if (!message) {
      res.status(404).json({ error: "Message not found." });
      return;
    }
    await db.delete(directChatMessagesTable).where(eq(directChatMessagesTable.id, message.id));
    res.json(DeleteChatMessageResponse.parse({ ok: true }));
  },
);

export default router;
