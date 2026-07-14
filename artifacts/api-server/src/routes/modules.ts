import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import crypto from "node:crypto";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import {
  db,
  attendanceCodesTable,
  attendanceRecordsTable,
  companiesTable,
  companyPostsTable,
  fundRequestsTable,
  leaveRequestsTable,
  projectDeliverablesTable,
  projectMembersTable,
  projectsTable,
  requisitionsTable,
  usersTable,
} from "@workspace/db";
import {
  ChangeMyPasswordBody,
  CheckInBody,
  CheckInResponse,
  CheckOutResponse,
  CreateFundRequestBody,
  CreateFundRequestResponse,
  CreateLeaveRequestBody,
  CreateLeaveRequestResponse,
  CreatePostBody,
  CreatePostResponse,
  CreateProjectBody,
  CreateProjectResponse,
  CreateRequisitionBody,
  CreateRequisitionResponse,
  GetAttendanceCodeResponse,
  GetMyLeaveBalanceResponse,
  GetMySummaryResponse,
  ListAttendanceRecordsResponse,
  ListFundRequestsResponse,
  ListLeaveRequestsResponse,
  ListMyAttendanceResponse,
  ListMyFundRequestsResponse,
  ListMyLeaveRequestsResponse,
  ListMyProjectsResponse,
  ListMyRequisitionsResponse,
  ListPostsResponse,
  ListProjectsResponse,
  ListRequisitionsResponse,
  ReviewFundRequestBody,
  ReviewFundRequestResponse,
  ReviewLeaveRequestBody,
  ReviewLeaveRequestResponse,
  ReviewRequisitionBody,
  ReviewRequisitionResponse,
  UpdatePostBody,
  UpdatePostResponse,
  UpdateProjectBody,
  UpdateProjectResponse,
} from "@workspace/api-zod";
import {
  hashPassword,
  requireAuth,
  requireManagementPermission,
  verifyPassword,
} from "../lib/auth";
import { notify } from "../lib/notify";

const router: IRouter = Router();

function requireEmployee(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.currentUser) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  if (req.currentUser.role !== "employee") {
    res.status(403).json({ error: "Employee account required" });
    return;
  }
  next();
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(start: string, end: string): number {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.floor(ms / 86_400_000) + 1;
}

async function leaveBalance(
  companyId: number,
  userId: number,
): Promise<{ allocation: number; used: number; remaining: number }> {
  const [company] = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.id, companyId));
  const allocation = company?.annualLeaveDays ?? 20;
  const year = new Date().getFullYear();
  const rows = await db
    .select()
    .from(leaveRequestsTable)
    .where(
      and(
        eq(leaveRequestsTable.userId, userId),
        eq(leaveRequestsTable.status, "approved"),
        gte(leaveRequestsTable.startDate, `${year}-01-01`),
      ),
    );
  const used = rows
    .filter((r) => r.type !== "unpaid")
    .reduce((acc, r) => acc + r.days, 0);
  return { allocation, used, remaining: Math.max(0, allocation - used) };
}

async function loadProjects(companyId: number, onlyUserId?: number) {
  let projects = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.companyId, companyId))
    .orderBy(desc(projectsTable.createdAt));
  const ids = projects.map((p) => p.id);
  const members = ids.length
    ? await db
        .select({
          projectId: projectMembersTable.projectId,
          userId: projectMembersTable.userId,
          fullName: usersTable.fullName,
        })
        .from(projectMembersTable)
        .innerJoin(usersTable, eq(projectMembersTable.userId, usersTable.id))
        .where(
          and(
            inArray(projectMembersTable.projectId, ids),
            eq(usersTable.companyId, companyId),
          ),
        )
    : [];
  const deliverables = ids.length
    ? await db
        .select()
        .from(projectDeliverablesTable)
        .where(inArray(projectDeliverablesTable.projectId, ids))
    : [];
  if (onlyUserId !== undefined) {
    const mine = new Set(
      members.filter((m) => m.userId === onlyUserId).map((m) => m.projectId),
    );
    projects = projects.filter((p) => mine.has(p.id));
  }
  return projects.map((p) => ({
    ...p,
    members: members
      .filter((m) => m.projectId === p.id)
      .map(({ userId, fullName }) => ({ userId, fullName })),
    deliverables: deliverables.filter((d) => d.projectId === p.id),
  }));
}

// ---------------------------------------------------------------------------
// Self-service: summary + change password
// ---------------------------------------------------------------------------

router.get(
  "/me/summary",
  requireAuth,
  requireEmployee,
  async (req, res): Promise<void> => {
    const me = req.currentUser!;
    const [attendanceRows, balance, projects, funds, reqs, announcements] =
      await Promise.all([
        db
          .select()
          .from(attendanceRecordsTable)
          .where(
            and(
              eq(attendanceRecordsTable.userId, me.id),
              eq(attendanceRecordsTable.forDate, today()),
            ),
          ),
        leaveBalance(me.companyId, me.id),
        loadProjects(me.companyId, me.id),
        db
          .select()
          .from(fundRequestsTable)
          .where(
            and(
              eq(fundRequestsTable.userId, me.id),
              eq(fundRequestsTable.status, "pending"),
            ),
          ),
        db
          .select()
          .from(requisitionsTable)
          .where(
            and(
              eq(requisitionsTable.userId, me.id),
              eq(requisitionsTable.status, "pending"),
            ),
          ),
        db
          .select()
          .from(companyPostsTable)
          .where(
            and(
              eq(companyPostsTable.companyId, me.companyId),
              eq(companyPostsTable.kind, "announcement"),
            ),
          )
          .orderBy(desc(companyPostsTable.createdAt))
          .limit(5),
      ]);
    res.json(
      GetMySummaryResponse.parse({
        attendanceToday: attendanceRows[0] ?? null,
        leaveBalance: balance,
        activeProjects: projects.filter((p) => p.status === "active").length,
        pendingFundRequests: funds.length,
        pendingRequisitions: reqs.length,
        announcements,
      }),
    );
  },
);

router.post(
  "/me/change-password",
  requireAuth,
  async (req, res): Promise<void> => {
    const parsed = ChangeMyPasswordBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "New password must be at least 8 characters." });
      return;
    }
    const { currentPassword, newPassword, confirmPassword } = parsed.data;
    if (newPassword !== confirmPassword) {
      res.status(400).json({ error: "Passwords do not match." });
      return;
    }
    const me = req.currentUser!;
    if (!me.passwordHash || !(await verifyPassword(currentPassword, me.passwordHash))) {
      res.status(400).json({ error: "Current password is incorrect." });
      return;
    }
    await db
      .update(usersTable)
      .set({ passwordHash: await hashPassword(newPassword) })
      .where(eq(usersTable.id, me.id));
    res.status(204).end();
  },
);

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------

router.get(
  "/attendance/code",
  requireAuth,
  requireManagementPermission("manage_attendance_settings"),
  async (req, res): Promise<void> => {
    const companyId = req.currentUser!.companyId;
    const forDate = today();
    let [row] = await db
      .select()
      .from(attendanceCodesTable)
      .where(
        and(
          eq(attendanceCodesTable.companyId, companyId),
          eq(attendanceCodesTable.forDate, forDate),
        ),
      );
    if (!row) {
      const code = crypto.randomBytes(4).toString("hex").toUpperCase();
      [row] = await db
        .insert(attendanceCodesTable)
        .values({ companyId, code, forDate })
        .returning();
    }
    res.json(GetAttendanceCodeResponse.parse({ code: row.code, forDate }));
  },
);

router.post(
  "/attendance/check-in",
  requireAuth,
  requireEmployee,
  async (req, res): Promise<void> => {
    const parsed = CheckInBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Enter the attendance code." });
      return;
    }
    const me = req.currentUser!;
    const forDate = today();
    const [codeRow] = await db
      .select()
      .from(attendanceCodesTable)
      .where(
        and(
          eq(attendanceCodesTable.companyId, me.companyId),
          eq(attendanceCodesTable.forDate, forDate),
        ),
      );
    if (!codeRow || codeRow.code !== parsed.data.code.trim().toUpperCase()) {
      res.status(400).json({ error: "Invalid or expired attendance code." });
      return;
    }
    const [existing] = await db
      .select()
      .from(attendanceRecordsTable)
      .where(
        and(
          eq(attendanceRecordsTable.userId, me.id),
          eq(attendanceRecordsTable.forDate, forDate),
        ),
      );
    if (existing) {
      res.status(400).json({ error: "You have already checked in today." });
      return;
    }
    const [record] = await db
      .insert(attendanceRecordsTable)
      .values({ companyId: me.companyId, userId: me.id, forDate })
      .returning();
    res.json(CheckInResponse.parse(record));
  },
);

router.post(
  "/attendance/check-out",
  requireAuth,
  requireEmployee,
  async (req, res): Promise<void> => {
    const me = req.currentUser!;
    const [existing] = await db
      .select()
      .from(attendanceRecordsTable)
      .where(
        and(
          eq(attendanceRecordsTable.userId, me.id),
          eq(attendanceRecordsTable.forDate, today()),
        ),
      );
    if (!existing) {
      res.status(400).json({ error: "You have not checked in today." });
      return;
    }
    if (existing.checkOutAt) {
      res.status(400).json({ error: "You have already checked out today." });
      return;
    }
    const [record] = await db
      .update(attendanceRecordsTable)
      .set({ checkOutAt: new Date() })
      .where(eq(attendanceRecordsTable.id, existing.id))
      .returning();
    res.json(CheckOutResponse.parse(record));
  },
);

router.get(
  "/attendance/me",
  requireAuth,
  requireEmployee,
  async (req, res): Promise<void> => {
    const me = req.currentUser!;
    const from = typeof req.query.from === "string" ? req.query.from : null;
    const to = typeof req.query.to === "string" ? req.query.to : null;
    const conditions = [eq(attendanceRecordsTable.userId, me.id)];
    if (from) conditions.push(gte(attendanceRecordsTable.forDate, from));
    if (to) conditions.push(lte(attendanceRecordsTable.forDate, to));
    const rows = await db
      .select()
      .from(attendanceRecordsTable)
      .where(and(...conditions))
      .orderBy(desc(attendanceRecordsTable.forDate))
      .limit(200);
    res.json(ListMyAttendanceResponse.parse(rows));
  },
);

router.get(
  "/attendance/records",
  requireAuth,
  requireManagementPermission("manage_attendance_settings"),
  async (req, res): Promise<void> => {
    const companyId = req.currentUser!.companyId;
    const date = typeof req.query.date === "string" ? req.query.date : null;
    const conditions = [eq(attendanceRecordsTable.companyId, companyId)];
    if (date) conditions.push(eq(attendanceRecordsTable.forDate, date));
    const rows = await db
      .select({
        record: attendanceRecordsTable,
        employeeName: usersTable.fullName,
        employeeCode: usersTable.employeeCode,
      })
      .from(attendanceRecordsTable)
      .innerJoin(usersTable, eq(attendanceRecordsTable.userId, usersTable.id))
      .where(and(...conditions))
      .orderBy(desc(attendanceRecordsTable.checkInAt))
      .limit(500);
    res.json(
      ListAttendanceRecordsResponse.parse(
        rows.map((r) => ({
          ...r.record,
          employeeName: r.employeeName,
          employeeCode: r.employeeCode,
        })),
      ),
    );
  },
);

// ---------------------------------------------------------------------------
// Leave
// ---------------------------------------------------------------------------

router.get(
  "/leave/balance",
  requireAuth,
  requireEmployee,
  async (req, res): Promise<void> => {
    const me = req.currentUser!;
    res.json(
      GetMyLeaveBalanceResponse.parse(await leaveBalance(me.companyId, me.id)),
    );
  },
);

router.get(
  "/leave/me",
  requireAuth,
  requireEmployee,
  async (req, res): Promise<void> => {
    const rows = await db
      .select()
      .from(leaveRequestsTable)
      .where(eq(leaveRequestsTable.userId, req.currentUser!.id))
      .orderBy(desc(leaveRequestsTable.createdAt));
    res.json(ListMyLeaveRequestsResponse.parse(rows));
  },
);

router.get(
  "/leave",
  requireAuth,
  requireManagementPermission("manage_leave"),
  async (req, res): Promise<void> => {
    const rows = await db
      .select({
        request: leaveRequestsTable,
        employeeName: usersTable.fullName,
        employeeCode: usersTable.employeeCode,
      })
      .from(leaveRequestsTable)
      .innerJoin(usersTable, eq(leaveRequestsTable.userId, usersTable.id))
      .where(eq(leaveRequestsTable.companyId, req.currentUser!.companyId))
      .orderBy(desc(leaveRequestsTable.createdAt));
    res.json(
      ListLeaveRequestsResponse.parse(
        rows.map((r) => ({
          ...r.request,
          employeeName: r.employeeName,
          employeeCode: r.employeeCode,
        })),
      ),
    );
  },
);

router.post(
  "/leave",
  requireAuth,
  requireEmployee,
  async (req, res): Promise<void> => {
    const parsed = CreateLeaveRequestBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Fill in all leave request fields." });
      return;
    }
    const { type, startDate, endDate, reason } = parsed.data;
    const days = daysBetween(startDate, endDate);
    if (Number.isNaN(days) || days < 1) {
      res.status(400).json({ error: "End date must be on or after the start date." });
      return;
    }
    const me = req.currentUser!;
    if (type !== "unpaid") {
      const balance = await leaveBalance(me.companyId, me.id);
      if (days > balance.remaining) {
        res.status(400).json({
          error: `Requested ${days} day(s) but only ${balance.remaining} remaining.`,
        });
        return;
      }
    }
    const [request] = await db
      .insert(leaveRequestsTable)
      .values({
        companyId: me.companyId,
        userId: me.id,
        type,
        startDate,
        endDate,
        days,
        reason,
      })
      .returning();
    await notify(
      me.companyId,
      "leave_request",
      `${me.fullName} submitted a ${type} leave request (${days} day${days === 1 ? "" : "s"}).`,
    );
    res.status(201).json(CreateLeaveRequestResponse.parse(request));
  },
);

router.post(
  "/leave/:id/review",
  requireAuth,
  requireManagementPermission("manage_leave"),
  async (req, res): Promise<void> => {
    const parsed = ReviewLeaveRequestBody.safeParse(req.body);
    const id = Number(req.params.id);
    if (
      !parsed.success ||
      Number.isNaN(id) ||
      !["approved", "rejected"].includes(parsed.data.status)
    ) {
      res.status(400).json({ error: "Invalid review." });
      return;
    }
    const me = req.currentUser!;
    const [updated] = await db
      .update(leaveRequestsTable)
      .set({
        status: parsed.data.status,
        reviewNote: parsed.data.reviewNote ?? null,
        reviewedBy: me.id,
      })
      .where(
        and(
          eq(leaveRequestsTable.id, id),
          eq(leaveRequestsTable.companyId, me.companyId),
        ),
      )
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Leave request not found." });
      return;
    }
    const [employee] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, updated.userId));
    await notify(
      me.companyId,
      `leave_${parsed.data.status}`,
      `Your ${updated.type} leave request (${updated.startDate} to ${updated.endDate}) was ${parsed.data.status}.`,
      updated.userId,
    );
    res.json(
      ReviewLeaveRequestResponse.parse({
        ...updated,
        employeeName: employee?.fullName ?? "",
        employeeCode: employee?.employeeCode ?? null,
      }),
    );
  },
);

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

router.get(
  "/projects/me",
  requireAuth,
  requireEmployee,
  async (req, res): Promise<void> => {
    const me = req.currentUser!;
    res.json(
      ListMyProjectsResponse.parse(await loadProjects(me.companyId, me.id)),
    );
  },
);

router.get(
  "/projects",
  requireAuth,
  requireManagementPermission("manage_projects"),
  async (req, res): Promise<void> => {
    res.json(
      ListProjectsResponse.parse(
        await loadProjects(req.currentUser!.companyId),
      ),
    );
  },
);

// Returns the subset of memberIds that are real users of this company.
async function validateMemberIds(
  companyId: number,
  memberIds: number[] | undefined,
): Promise<number[] | undefined> {
  if (memberIds === undefined) return undefined;
  if (!memberIds.length) return [];
  const rows = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(
      and(
        eq(usersTable.companyId, companyId),
        inArray(usersTable.id, memberIds),
      ),
    );
  const valid = new Set(rows.map((r) => r.id));
  return memberIds.filter((id) => valid.has(id));
}

async function syncProjectRelations(
  projectId: number,
  memberIds: number[] | undefined,
  deliverables:
    | Array<{ title: string; dueDate?: string; status?: string }>
    | undefined,
): Promise<void> {
  if (memberIds !== undefined) {
    await db
      .delete(projectMembersTable)
      .where(eq(projectMembersTable.projectId, projectId));
    if (memberIds.length) {
      await db
        .insert(projectMembersTable)
        .values(memberIds.map((userId) => ({ projectId, userId })));
    }
  }
  if (deliverables !== undefined) {
    await db
      .delete(projectDeliverablesTable)
      .where(eq(projectDeliverablesTable.projectId, projectId));
    if (deliverables.length) {
      await db.insert(projectDeliverablesTable).values(
        deliverables.map((d) => ({
          projectId,
          title: d.title,
          dueDate: d.dueDate || null,
          status: d.status ?? "pending",
        })),
      );
    }
  }
}

router.post(
  "/projects",
  requireAuth,
  requireManagementPermission("manage_projects"),
  async (req, res): Promise<void> => {
    const parsed = CreateProjectBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Project name is required." });
      return;
    }
    const me = req.currentUser!;
    const { memberIds: rawMemberIds, deliverables, ...fields } = parsed.data;
    const memberIds = await validateMemberIds(me.companyId, rawMemberIds);
    const [project] = await db
      .insert(projectsTable)
      .values({
        companyId: me.companyId,
        name: fields.name,
        description: fields.description ?? null,
        status: fields.status ?? "planning",
        startDate: fields.startDate || null,
        deadline: fields.deadline || null,
        progress: fields.progress ?? 0,
      })
      .returning();
    await syncProjectRelations(project.id, memberIds, deliverables);
    for (const userId of memberIds ?? []) {
      await notify(
        me.companyId,
        "project_assigned",
        `You have been assigned to the project "${project.name}".`,
        userId,
      );
    }
    const [full] = await loadProjects(me.companyId).then((all) =>
      all.filter((p) => p.id === project.id),
    );
    res.status(201).json(CreateProjectResponse.parse(full));
  },
);

router.patch(
  "/projects/:id",
  requireAuth,
  requireManagementPermission("manage_projects"),
  async (req, res): Promise<void> => {
    const parsed = UpdateProjectBody.safeParse(req.body);
    const id = Number(req.params.id);
    if (!parsed.success || Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid project update." });
      return;
    }
    const me = req.currentUser!;
    const { memberIds: rawMemberIds, deliverables, ...fields } = parsed.data;
    const memberIds = await validateMemberIds(me.companyId, rawMemberIds);
    const previousMembers = await db
      .select()
      .from(projectMembersTable)
      .where(eq(projectMembersTable.projectId, id));
    const [project] = await db
      .update(projectsTable)
      .set({
        name: fields.name,
        description: fields.description ?? null,
        status: fields.status ?? "planning",
        startDate: fields.startDate || null,
        deadline: fields.deadline || null,
        progress: fields.progress ?? 0,
      })
      .where(
        and(eq(projectsTable.id, id), eq(projectsTable.companyId, me.companyId)),
      )
      .returning();
    if (!project) {
      res.status(404).json({ error: "Project not found." });
      return;
    }
    await syncProjectRelations(project.id, memberIds, deliverables);
    const previousIds = new Set(previousMembers.map((m) => m.userId));
    for (const userId of memberIds ?? []) {
      if (!previousIds.has(userId)) {
        await notify(
          me.companyId,
          "project_assigned",
          `You have been assigned to the project "${project.name}".`,
          userId,
        );
      }
    }
    const [full] = await loadProjects(me.companyId).then((all) =>
      all.filter((p) => p.id === project.id),
    );
    res.json(UpdateProjectResponse.parse(full));
  },
);

router.delete(
  "/projects/:id",
  requireAuth,
  requireManagementPermission("manage_projects"),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    await db
      .delete(projectsTable)
      .where(
        and(
          eq(projectsTable.id, id),
          eq(projectsTable.companyId, req.currentUser!.companyId),
        ),
      );
    res.status(204).end();
  },
);

// ---------------------------------------------------------------------------
// Fund requests
// ---------------------------------------------------------------------------

router.get(
  "/fund-requests/me",
  requireAuth,
  requireEmployee,
  async (req, res): Promise<void> => {
    const rows = await db
      .select()
      .from(fundRequestsTable)
      .where(eq(fundRequestsTable.userId, req.currentUser!.id))
      .orderBy(desc(fundRequestsTable.createdAt));
    res.json(ListMyFundRequestsResponse.parse(rows));
  },
);

router.get(
  "/fund-requests",
  requireAuth,
  requireManagementPermission("manage_finance"),
  async (req, res): Promise<void> => {
    const rows = await db
      .select({
        request: fundRequestsTable,
        employeeName: usersTable.fullName,
        employeeCode: usersTable.employeeCode,
      })
      .from(fundRequestsTable)
      .innerJoin(usersTable, eq(fundRequestsTable.userId, usersTable.id))
      .where(eq(fundRequestsTable.companyId, req.currentUser!.companyId))
      .orderBy(desc(fundRequestsTable.createdAt));
    res.json(
      ListFundRequestsResponse.parse(
        rows.map((r) => ({
          ...r.request,
          employeeName: r.employeeName,
          employeeCode: r.employeeCode,
        })),
      ),
    );
  },
);

router.post(
  "/fund-requests",
  requireAuth,
  requireEmployee,
  async (req, res): Promise<void> => {
    const parsed = CreateFundRequestBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Amount and purpose are required." });
      return;
    }
    const me = req.currentUser!;
    const [request] = await db
      .insert(fundRequestsTable)
      .values({
        companyId: me.companyId,
        userId: me.id,
        amount: parsed.data.amount,
        purpose: parsed.data.purpose,
        details: parsed.data.details ?? null,
      })
      .returning();
    await notify(
      me.companyId,
      "fund_request",
      `${me.fullName} submitted a fund request (${parsed.data.amount}).`,
    );
    res.status(201).json(CreateFundRequestResponse.parse(request));
  },
);

router.post(
  "/fund-requests/:id/review",
  requireAuth,
  requireManagementPermission("manage_finance"),
  async (req, res): Promise<void> => {
    const parsed = ReviewFundRequestBody.safeParse(req.body);
    const id = Number(req.params.id);
    if (
      !parsed.success ||
      Number.isNaN(id) ||
      !["approved", "rejected"].includes(parsed.data.status)
    ) {
      res.status(400).json({ error: "Invalid review." });
      return;
    }
    const me = req.currentUser!;
    const [updated] = await db
      .update(fundRequestsTable)
      .set({
        status: parsed.data.status,
        reviewNote: parsed.data.reviewNote ?? null,
        reviewedBy: me.id,
      })
      .where(
        and(
          eq(fundRequestsTable.id, id),
          eq(fundRequestsTable.companyId, me.companyId),
        ),
      )
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Fund request not found." });
      return;
    }
    const [employee] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, updated.userId));
    await notify(
      me.companyId,
      `fund_request_${parsed.data.status}`,
      `Your fund request for "${updated.purpose}" was ${parsed.data.status}.`,
      updated.userId,
    );
    res.json(
      ReviewFundRequestResponse.parse({
        ...updated,
        employeeName: employee?.fullName ?? "",
        employeeCode: employee?.employeeCode ?? null,
      }),
    );
  },
);

// ---------------------------------------------------------------------------
// Requisitions
// ---------------------------------------------------------------------------

router.get(
  "/requisitions/me",
  requireAuth,
  requireEmployee,
  async (req, res): Promise<void> => {
    const rows = await db
      .select()
      .from(requisitionsTable)
      .where(eq(requisitionsTable.userId, req.currentUser!.id))
      .orderBy(desc(requisitionsTable.createdAt));
    res.json(ListMyRequisitionsResponse.parse(rows));
  },
);

router.get(
  "/requisitions",
  requireAuth,
  requireManagementPermission("manage_requisitions"),
  async (req, res): Promise<void> => {
    const rows = await db
      .select({
        request: requisitionsTable,
        employeeName: usersTable.fullName,
        employeeCode: usersTable.employeeCode,
      })
      .from(requisitionsTable)
      .innerJoin(usersTable, eq(requisitionsTable.userId, usersTable.id))
      .where(eq(requisitionsTable.companyId, req.currentUser!.companyId))
      .orderBy(desc(requisitionsTable.createdAt));
    res.json(
      ListRequisitionsResponse.parse(
        rows.map((r) => ({
          ...r.request,
          employeeName: r.employeeName,
          employeeCode: r.employeeCode,
        })),
      ),
    );
  },
);

router.post(
  "/requisitions",
  requireAuth,
  requireEmployee,
  async (req, res): Promise<void> => {
    const parsed = CreateRequisitionBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Item, quantity, and reason are required." });
      return;
    }
    const me = req.currentUser!;
    const [request] = await db
      .insert(requisitionsTable)
      .values({
        companyId: me.companyId,
        userId: me.id,
        item: parsed.data.item,
        quantity: parsed.data.quantity,
        reason: parsed.data.reason,
      })
      .returning();
    await notify(
      me.companyId,
      "requisition",
      `${me.fullName} submitted a requisition for ${parsed.data.quantity} x ${parsed.data.item}.`,
    );
    res.status(201).json(CreateRequisitionResponse.parse(request));
  },
);

router.post(
  "/requisitions/:id/review",
  requireAuth,
  requireManagementPermission("manage_requisitions"),
  async (req, res): Promise<void> => {
    const parsed = ReviewRequisitionBody.safeParse(req.body);
    const id = Number(req.params.id);
    if (!parsed.success || Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid review." });
      return;
    }
    const me = req.currentUser!;
    const [updated] = await db
      .update(requisitionsTable)
      .set({
        status: parsed.data.status,
        reviewNote: parsed.data.reviewNote ?? null,
        reviewedBy: me.id,
      })
      .where(
        and(
          eq(requisitionsTable.id, id),
          eq(requisitionsTable.companyId, me.companyId),
        ),
      )
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Requisition not found." });
      return;
    }
    const [employee] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, updated.userId));
    await notify(
      me.companyId,
      `requisition_${parsed.data.status}`,
      `Your requisition for "${updated.item}" was ${parsed.data.status}.`,
      updated.userId,
    );
    res.json(
      ReviewRequisitionResponse.parse({
        ...updated,
        employeeName: employee?.fullName ?? "",
        employeeCode: employee?.employeeCode ?? null,
      }),
    );
  },
);

// ---------------------------------------------------------------------------
// Company posts (announcements, policies, knowledge base)
// ---------------------------------------------------------------------------

router.get("/posts", requireAuth, async (req, res): Promise<void> => {
  const kind = typeof req.query.kind === "string" ? req.query.kind : null;
  const conditions = [
    eq(companyPostsTable.companyId, req.currentUser!.companyId),
  ];
  if (kind) conditions.push(eq(companyPostsTable.kind, kind));
  const rows = await db
    .select()
    .from(companyPostsTable)
    .where(and(...conditions))
    .orderBy(desc(companyPostsTable.createdAt));
  res.json(ListPostsResponse.parse(rows));
});

router.post(
  "/posts",
  requireAuth,
  requireManagementPermission("manage_content"),
  async (req, res): Promise<void> => {
    const parsed = CreatePostBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Title and content are required." });
      return;
    }
    const me = req.currentUser!;
    const [post] = await db
      .insert(companyPostsTable)
      .values({
        companyId: me.companyId,
        kind: parsed.data.kind,
        title: parsed.data.title,
        body: parsed.data.body,
        createdBy: me.id,
      })
      .returning();
    if (parsed.data.kind === "announcement") {
      const employees = await db
        .select()
        .from(usersTable)
        .where(
          and(
            eq(usersTable.companyId, me.companyId),
            eq(usersTable.role, "employee"),
            eq(usersTable.status, "active"),
          ),
        );
      for (const employee of employees) {
        await notify(
          me.companyId,
          "announcement",
          `New announcement: ${parsed.data.title}`,
          employee.id,
        );
      }
    }
    res.status(201).json(CreatePostResponse.parse(post));
  },
);

router.patch(
  "/posts/:id",
  requireAuth,
  requireManagementPermission("manage_content"),
  async (req, res): Promise<void> => {
    const parsed = UpdatePostBody.safeParse(req.body);
    const id = Number(req.params.id);
    if (!parsed.success || Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid post update." });
      return;
    }
    const [post] = await db
      .update(companyPostsTable)
      .set({
        kind: parsed.data.kind,
        title: parsed.data.title,
        body: parsed.data.body,
      })
      .where(
        and(
          eq(companyPostsTable.id, id),
          eq(companyPostsTable.companyId, req.currentUser!.companyId),
        ),
      )
      .returning();
    if (!post) {
      res.status(404).json({ error: "Post not found." });
      return;
    }
    res.json(UpdatePostResponse.parse(post));
  },
);

router.delete(
  "/posts/:id",
  requireAuth,
  requireManagementPermission("manage_content"),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    await db
      .delete(companyPostsTable)
      .where(
        and(
          eq(companyPostsTable.id, id),
          eq(companyPostsTable.companyId, req.currentUser!.companyId),
        ),
      );
    res.status(204).end();
  },
);

export default router;
