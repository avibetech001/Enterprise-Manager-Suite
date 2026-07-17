import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import crypto from "node:crypto";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import {
  db,
  attendanceCodesTable,
  attendanceRecordsTable,
  attendanceSettingsTable,
  companiesTable,
  companyPostsTable,
  fundRequestsTable,
  leaveRequestsTable,
  projectDeliverablesTable,
  projectMembersTable,
  projectsTable,
  requisitionsTable,
  usersTable,
  employeeQueriesTable,
} from "@workspace/db";
import {
  ChangeMyPasswordBody,
  CheckInBody,
  CheckInResponse,
  CheckOutBody,
  CheckOutResponse,
  GetAttendanceSettingsResponse,
  UpdateAttendanceSettingsBody,
  UpdateAttendanceSettingsResponse,
  UpdateMyProjectProgressBody,
  UpdateMyProjectProgressResponse,
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
  ListQueriesResponse,
  ListMyQueriesResponse,
  SubmitMyProjectBody,
  SubmitMyProjectResponse,
  CreateQueryBody,
  CreateQueryResponse,
  GetEmployeeOverviewResponse,
  GetMySummaryResponse,
  GetPendingCountsResponse,
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
  requireRole,
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

// All attendance day/time decisions use one explicit company timezone so
// forDate, weekday selection, and late/early checks can never disagree
// (the server itself runs in UTC).
const COMPANY_TZ = "Africa/Lagos";

function tzParts(): { date: string; weekday: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: COMPANY_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    weekday: weekdayNames.indexOf(get("weekday")),
    minutes: (Number(get("hour")) % 24) * 60 + Number(get("minute")),
  };
}

function today(): string {
  return tzParts().date;
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
  const leadIds = [
    ...new Set(projects.map((p) => p.leadUserId).filter((v): v is number => v !== null)),
  ];
  const leads = leadIds.length
    ? await db
        .select({ id: usersTable.id, fullName: usersTable.fullName })
        .from(usersTable)
        .where(
          and(inArray(usersTable.id, leadIds), eq(usersTable.companyId, companyId)),
        )
    : [];
  const leadNameById = new Map(leads.map((l) => [l.id, l.fullName]));
  return projects.map((p) => ({
    ...p,
    leadName: p.leadUserId != null ? (leadNameById.get(p.leadUserId) ?? null) : null,
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
    // Fixed, permanent company code (printable QR); first row wins.
    let [row] = await db
      .select()
      .from(attendanceCodesTable)
      .where(eq(attendanceCodesTable.companyId, companyId))
      .orderBy(attendanceCodesTable.id)
      .limit(1);
    if (!row) {
      const code = crypto.randomBytes(4).toString("hex").toUpperCase();
      [row] = await db
        .insert(attendanceCodesTable)
        .values({ companyId, code, forDate: today() })
        .returning();
    }
    res.json(GetAttendanceCodeResponse.parse({ code: row.code }));
  },
);

// --- Attendance settings & geofencing helpers ------------------------------

type DayMode = "office" | "remote" | "off";
type DaySchedule = { mode: DayMode; start: string; end: string };
type WeeklySchedule = Record<
  "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun",
  DaySchedule
>;

const DEFAULT_SCHEDULE: WeeklySchedule = {
  mon: { mode: "office", start: "08:00", end: "16:00" },
  tue: { mode: "office", start: "09:00", end: "17:00" },
  wed: { mode: "office", start: "09:00", end: "17:00" },
  thu: { mode: "remote", start: "09:00", end: "17:00" },
  fri: { mode: "office", start: "09:00", end: "17:00" },
  sat: { mode: "off", start: "09:00", end: "17:00" },
  sun: { mode: "off", start: "09:00", end: "17:00" },
};

function parseSchedule(raw: string | null | undefined): WeeklySchedule {
  if (!raw) return DEFAULT_SCHEDULE;
  try {
    const parsed = JSON.parse(raw) as Partial<WeeklySchedule>;
    return { ...DEFAULT_SCHEDULE, ...parsed };
  } catch {
    return DEFAULT_SCHEDULE;
  }
}

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

function todaySchedule(schedule: WeeklySchedule): DaySchedule {
  return schedule[DAY_KEYS[tzParts().weekday]];
}

const DEFAULT_ATTENDANCE_SETTINGS = {
  officeLat: null as string | null,
  officeLng: null as string | null,
  radiusMeters: 200,
  weeklySchedule: null as string | null,
};

async function getAttendanceSettings(companyId: number) {
  const [row] = await db
    .select()
    .from(attendanceSettingsTable)
    .where(eq(attendanceSettingsTable.companyId, companyId))
    .limit(1);
  return row ?? { companyId, ...DEFAULT_ATTENDANCE_SETTINGS };
}

function settingsToJson(s: {
  officeLat: string | null;
  officeLng: string | null;
  radiusMeters: number;
  weeklySchedule: string | null;
}) {
  return {
    officeLat: s.officeLat === null ? null : Number(s.officeLat),
    officeLng: s.officeLng === null ? null : Number(s.officeLng),
    radiusMeters: s.radiusMeters,
    schedule: parseSchedule(s.weeklySchedule),
  };
}

function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

// Returns minutes since midnight for "HH:MM"; NaN-safe.
function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function nowMinutes(): number {
  return tzParts().minutes;
}

// Validates the scanned code and (when an office location is configured)
// enforces the geofence. Returns the distance in meters, or an error string.
async function validateScan(
  companyId: number,
  code: string,
  lat: number | null | undefined,
  lng: number | null | undefined,
): Promise<{ error: string } | { distanceM: number | null }> {
  const [codeRow] = await db
    .select()
    .from(attendanceCodesTable)
    .where(eq(attendanceCodesTable.companyId, companyId))
    .orderBy(attendanceCodesTable.id)
    .limit(1);
  if (!codeRow || codeRow.code !== code.trim().toUpperCase()) {
    return { error: "Invalid attendance code." };
  }
  const settings = await getAttendanceSettings(companyId);
  const day = todaySchedule(parseSchedule(settings.weeklySchedule));
  if (day.mode === "off") {
    return { error: "Today is not a working day." };
  }
  if (
    day.mode === "remote" ||
    settings.officeLat === null ||
    settings.officeLng === null
  ) {
    return { distanceM: null };
  }
  if (lat === null || lat === undefined || lng === null || lng === undefined) {
    return {
      error:
        "Location is required. Allow location access in your browser and try again.",
    };
  }
  const distanceM = haversineMeters(
    Number(settings.officeLat),
    Number(settings.officeLng),
    lat,
    lng,
  );
  if (distanceM > settings.radiusMeters) {
    return {
      error: `You are too far from the office (${distanceM} m away, allowed within ${settings.radiusMeters} m).`,
    };
  }
  return { distanceM };
}

router.get(
  "/attendance/settings",
  requireAuth,
  requireManagementPermission("manage_attendance_settings"),
  async (req, res): Promise<void> => {
    const settings = await getAttendanceSettings(req.currentUser!.companyId);
    res.json(GetAttendanceSettingsResponse.parse(settingsToJson(settings)));
  },
);

router.put(
  "/attendance/settings",
  requireAuth,
  requireManagementPermission("manage_attendance_settings"),
  async (req, res): Promise<void> => {
    const parsed = UpdateAttendanceSettingsBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid attendance settings." });
      return;
    }
    const companyId = req.currentUser!.companyId;
    const d = parsed.data;
    if (d.schedule) {
      for (const day of Object.values(d.schedule)) {
        if (day.mode !== "off" && minutesOf(day.start) >= minutesOf(day.end)) {
          res
            .status(400)
            .json({ error: "Work start must be before work end." });
          return;
        }
      }
    }
    const values = {
      ...(d.officeLat !== undefined
        ? { officeLat: d.officeLat === null ? null : String(d.officeLat) }
        : {}),
      ...(d.officeLng !== undefined
        ? { officeLng: d.officeLng === null ? null : String(d.officeLng) }
        : {}),
      ...(d.radiusMeters !== undefined ? { radiusMeters: d.radiusMeters } : {}),
      ...(d.schedule !== undefined
        ? { weeklySchedule: JSON.stringify(d.schedule) }
        : {}),
    };
    const [row] = await db
      .insert(attendanceSettingsTable)
      .values({ companyId, ...values })
      .onConflictDoUpdate({
        target: attendanceSettingsTable.companyId,
        set: values,
      })
      .returning();
    res.json(UpdateAttendanceSettingsResponse.parse(settingsToJson(row)));
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
    const scan = await validateScan(
      me.companyId,
      parsed.data.code,
      parsed.data.lat,
      parsed.data.lng,
    );
    if ("error" in scan) {
      res.status(400).json({ error: scan.error });
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
    const settings = await getAttendanceSettings(me.companyId);
    const day = todaySchedule(parseSchedule(settings.weeklySchedule));
    const checkInStatus =
      day.mode !== "off" && nowMinutes() > minutesOf(day.start)
        ? "late"
        : "on_time";
    const [record] = await db
      .insert(attendanceRecordsTable)
      .values({
        companyId: me.companyId,
        userId: me.id,
        forDate,
        checkInStatus,
        checkInDistanceM: scan.distanceM,
      })
      .returning();
    res.json(CheckInResponse.parse(record));
  },
);

router.post(
  "/attendance/check-out",
  requireAuth,
  requireEmployee,
  async (req, res): Promise<void> => {
    const parsed = CheckOutBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Scan or enter the attendance code." });
      return;
    }
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
    const scan = await validateScan(
      me.companyId,
      parsed.data.code,
      parsed.data.lat,
      parsed.data.lng,
    );
    if ("error" in scan) {
      res.status(400).json({ error: scan.error });
      return;
    }
    const settings = await getAttendanceSettings(me.companyId);
    const day = todaySchedule(parseSchedule(settings.weeklySchedule));
    const checkOutStatus =
      day.mode !== "off" && nowMinutes() < minutesOf(day.end)
        ? "early"
        : "on_time";
    const [record] = await db
      .update(attendanceRecordsTable)
      .set({
        checkOutAt: new Date(),
        checkOutStatus,
        checkOutDistanceM: scan.distanceM,
      })
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

    // When a specific date is requested, list employees with no record that
    // day as absent.
    let absent: Array<{
      userId: number;
      employeeName: string;
      employeeCode: string | null;
    }> = [];
    if (date) {
      const presentIds = new Set(rows.map((r) => r.record.userId));
      const employees = await db
        .select({
          id: usersTable.id,
          fullName: usersTable.fullName,
          employeeCode: usersTable.employeeCode,
        })
        .from(usersTable)
        .where(
          and(
            eq(usersTable.companyId, companyId),
            eq(usersTable.role, "employee"),
          ),
        );
      absent = employees
        .filter((e) => !presentIds.has(e.id))
        .map((e) => ({
          userId: e.id,
          employeeName: e.fullName,
          employeeCode: e.employeeCode,
        }));
    }

    res.json(
      ListAttendanceRecordsResponse.parse({
        records: rows.map((r) => ({
          ...r.record,
          employeeName: r.employeeName,
          employeeCode: r.employeeCode,
        })),
        absent,
      }),
    );
  },
);

// ---------------------------------------------------------------------------
// Pending counts (management nav badges)
// ---------------------------------------------------------------------------

router.get(
  "/pending-counts",
  requireAuth,
  requireRole("super_admin", "hr"),
  async (req, res): Promise<void> => {
    const companyId = req.currentUser!.companyId;
    const [leave, funds, reqs] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(leaveRequestsTable)
        .where(
          and(
            eq(leaveRequestsTable.companyId, companyId),
            eq(leaveRequestsTable.status, "pending"),
          ),
        ),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(fundRequestsTable)
        .where(
          and(
            eq(fundRequestsTable.companyId, companyId),
            eq(fundRequestsTable.status, "pending"),
          ),
        ),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(requisitionsTable)
        .where(
          and(
            eq(requisitionsTable.companyId, companyId),
            eq(requisitionsTable.status, "pending"),
          ),
        ),
    ]);
    res.json(
      GetPendingCountsResponse.parse({
        leave: leave[0]?.count ?? 0,
        fundRequests: funds[0]?.count ?? 0,
        requisitions: reqs[0]?.count ?? 0,
      }),
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

router.post(
  "/projects/:id/submit",
  requireAuth,
  requireEmployee,
  async (req, res): Promise<void> => {
    const parsed = SubmitMyProjectBody.safeParse(req.body);
    const id = Number(req.params.id);
    if (!parsed.success || Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid project submission." });
      return;
    }
    const link = parsed.data.link?.trim() || null;
    if (!parsed.data.objectPath && !link) {
      res
        .status(400)
        .json({ error: "Please upload a file or provide a link." });
      return;
    }
    if (parsed.data.objectPath && !parsed.data.objectPath.startsWith("/objects/")) {
      res.status(400).json({ error: "Invalid uploaded file path." });
      return;
    }
    if (link && !/^https?:\/\//i.test(link)) {
      res
        .status(400)
        .json({ error: "Link must start with http:// or https://." });
      return;
    }
    const me = req.currentUser!;
    const [project] = await db
      .select()
      .from(projectsTable)
      .where(
        and(eq(projectsTable.id, id), eq(projectsTable.companyId, me.companyId)),
      );
    if (!project) {
      res.status(404).json({ error: "Project not found." });
      return;
    }
    const [membership] = await db
      .select()
      .from(projectMembersTable)
      .where(
        and(
          eq(projectMembersTable.projectId, id),
          eq(projectMembersTable.userId, me.id),
        ),
      );
    if (!membership) {
      res.status(404).json({ error: "You are not assigned to this project." });
      return;
    }
    await db
      .update(projectsTable)
      .set({
        submissionFilePath: parsed.data.objectPath || null,
        submissionFileName: parsed.data.fileName || null,
        submissionLink: link,
        submissionNote: parsed.data.note?.trim() || null,
        submittedAt: new Date(),
        submittedBy: me.id,
      })
      .where(eq(projectsTable.id, id));
    await notify(
      me.companyId,
      "project_submitted",
      `${me.fullName} submitted work for the project "${project.name}".`,
    );
    const [full] = await loadProjects(me.companyId, me.id).then((all) =>
      all.filter((p) => p.id === id),
    );
    res.json(SubmitMyProjectResponse.parse(full));
  },
);

router.patch(
  "/projects/:id/progress",
  requireAuth,
  requireEmployee,
  async (req, res): Promise<void> => {
    const parsed = UpdateMyProjectProgressBody.safeParse(req.body);
    const id = Number(req.params.id);
    if (!parsed.success || Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid progress update." });
      return;
    }
    const me = req.currentUser!;
    const [project] = await db
      .select()
      .from(projectsTable)
      .where(
        and(eq(projectsTable.id, id), eq(projectsTable.companyId, me.companyId)),
      );
    if (!project) {
      res.status(404).json({ error: "Project not found." });
      return;
    }
    const [membership] = await db
      .select()
      .from(projectMembersTable)
      .where(
        and(
          eq(projectMembersTable.projectId, id),
          eq(projectMembersTable.userId, me.id),
        ),
      );
    if (!membership) {
      res.status(404).json({ error: "You are not assigned to this project." });
      return;
    }
    const d = parsed.data;
    if (d.status !== undefined || d.progress !== undefined) {
      await db
        .update(projectsTable)
        .set({
          ...(d.status !== undefined ? { status: d.status } : {}),
          ...(d.progress !== undefined ? { progress: d.progress } : {}),
        })
        .where(eq(projectsTable.id, id));
    }
    for (const del of d.deliverables ?? []) {
      await db
        .update(projectDeliverablesTable)
        .set({ status: del.status })
        .where(
          and(
            eq(projectDeliverablesTable.id, del.id),
            eq(projectDeliverablesTable.projectId, id),
          ),
        );
    }
    const [full] = await loadProjects(me.companyId, me.id).then((all) =>
      all.filter((p) => p.id === id),
    );
    res.json(UpdateMyProjectProgressResponse.parse(full));
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

// Returns the lead user id if it is a real user of this company, else null.
async function resolveLeadUserId(
  companyId: number,
  leadUserId: number | null | undefined,
): Promise<number | null> {
  if (leadUserId == null) return null;
  const [row] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(
      and(eq(usersTable.id, leadUserId), eq(usersTable.companyId, companyId)),
    );
  return row ? row.id : null;
}

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
    const leadUserId = await resolveLeadUserId(me.companyId, fields.leadUserId);
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
        urgent: fields.urgent ?? false,
        leadUserId,
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
    const leadUserId = await resolveLeadUserId(me.companyId, fields.leadUserId);
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
        urgent: fields.urgent ?? false,
        leadUserId,
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
        category: parsed.data.category ?? null,
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
        category: parsed.data.category ?? null,
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

// ---------------------------------------------------------------------------
// Employee queries (disciplinary: query / deduction / fine)
// ---------------------------------------------------------------------------

async function withQueryNames(rows: (typeof employeeQueriesTable.$inferSelect)[]) {
  const ids = [
    ...new Set(rows.flatMap((r) => [r.userId, r.issuedBy]).filter((v): v is number => v != null)),
  ];
  const users = ids.length
    ? await db
        .select({ id: usersTable.id, fullName: usersTable.fullName })
        .from(usersTable)
        .where(inArray(usersTable.id, ids))
    : [];
  const nameById = new Map(users.map((u) => [u.id, u.fullName]));
  return rows.map((r) => ({
    ...r,
    employeeName: nameById.get(r.userId) ?? "Unknown",
    issuedByName: r.issuedBy != null ? (nameById.get(r.issuedBy) ?? null) : null,
  }));
}

router.get(
  "/queries/me",
  requireAuth,
  requireEmployee,
  async (req, res): Promise<void> => {
    const rows = await db
      .select()
      .from(employeeQueriesTable)
      .where(
        and(
          eq(employeeQueriesTable.userId, req.currentUser!.id),
          eq(employeeQueriesTable.companyId, req.currentUser!.companyId),
        ),
      )
      .orderBy(desc(employeeQueriesTable.createdAt));
    res.json(ListMyQueriesResponse.parse(await withQueryNames(rows)));
  },
);

router.get(
  "/queries",
  requireAuth,
  requireManagementPermission("manage_employees"),
  async (req, res): Promise<void> => {
    const companyId = req.currentUser!.companyId;
    const userId = req.query.userId ? Number(req.query.userId) : null;
    if (userId !== null && !Number.isInteger(userId)) {
      res.status(400).json({ error: "Invalid userId." });
      return;
    }
    const conditions = [eq(employeeQueriesTable.companyId, companyId)];
    if (userId) conditions.push(eq(employeeQueriesTable.userId, userId));
    const rows = await db
      .select()
      .from(employeeQueriesTable)
      .where(and(...conditions))
      .orderBy(desc(employeeQueriesTable.createdAt));
    res.json(ListQueriesResponse.parse(await withQueryNames(rows)));
  },
);

router.post(
  "/queries",
  requireAuth,
  requireManagementPermission("manage_employees"),
  async (req, res): Promise<void> => {
    const parsed = CreateQueryBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const companyId = req.currentUser!.companyId;
    const [target] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.id, parsed.data.userId),
          eq(usersTable.companyId, companyId),
          eq(usersTable.role, "employee"),
        ),
      );
    if (!target) {
      res.status(404).json({ error: "Employee not found." });
      return;
    }
    if (
      (parsed.data.category === "deduction" || parsed.data.category === "fine") &&
      !parsed.data.amount?.trim()
    ) {
      res.status(400).json({ error: "An amount is required for deductions and fines." });
      return;
    }
    const [row] = await db
      .insert(employeeQueriesTable)
      .values({
        companyId,
        userId: parsed.data.userId,
        issuedBy: req.currentUser!.id,
        category: parsed.data.category,
        amount: parsed.data.amount?.trim() || null,
        reason: parsed.data.reason.trim(),
      })
      .returning();
    const [withNames] = await withQueryNames([row!]);
    const label =
      parsed.data.category === "deduction"
        ? "A deduction"
        : parsed.data.category === "fine"
          ? "A fine"
          : "A query";
    await notify(
      companyId,
      "query_issued",
      `${label} has been issued against you: ${parsed.data.reason.trim()}`,
      parsed.data.userId,
    );
    res.status(201).json(CreateQueryResponse.parse(withNames));
  },
);

router.delete(
  "/queries/:id",
  requireAuth,
  requireManagementPermission("manage_employees"),
  async (req, res): Promise<void> => {
    const queryId = Number(req.params.id);
    if (!Number.isInteger(queryId)) {
      res.status(400).json({ error: "Invalid id." });
      return;
    }
    await db
      .delete(employeeQueriesTable)
      .where(
        and(
          eq(employeeQueriesTable.id, queryId),
          eq(employeeQueriesTable.companyId, req.currentUser!.companyId),
        ),
      );
    res.status(204).end();
  },
);

// ---------------------------------------------------------------------------
// Employee overview (management profile page)
// ---------------------------------------------------------------------------

router.get(
  "/employees/:id/overview",
  requireAuth,
  requireManagementPermission("manage_employees"),
  async (req, res): Promise<void> => {
    const companyId = req.currentUser!.companyId;
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId)) {
      res.status(400).json({ error: "Invalid id." });
      return;
    }
    const [target] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.id, userId),
          eq(usersTable.companyId, companyId),
          eq(usersTable.role, "employee"),
        ),
      );
    if (!target) {
      res.status(404).json({ error: "Employee not found." });
      return;
    }

    const year = new Date().getFullYear();
    const [leave, attendanceRows, projectRows, leaveReqs, fundReqs] =
      await Promise.all([
        leaveBalance(companyId, userId),
        db
          .select({
            checkInStatus: attendanceRecordsTable.checkInStatus,
          })
          .from(attendanceRecordsTable)
          .where(
            and(
              eq(attendanceRecordsTable.companyId, companyId),
              eq(attendanceRecordsTable.userId, userId),
              gte(attendanceRecordsTable.forDate, `${year}-01-01`),
            ),
          ),
        db
          .select({
            id: projectsTable.id,
            name: projectsTable.name,
            status: projectsTable.status,
            progress: projectsTable.progress,
          })
          .from(projectMembersTable)
          .innerJoin(projectsTable, eq(projectMembersTable.projectId, projectsTable.id))
          .where(
            and(
              eq(projectMembersTable.userId, userId),
              eq(projectsTable.companyId, companyId),
            ),
          ),
        db
          .select()
          .from(leaveRequestsTable)
          .where(
            and(
              eq(leaveRequestsTable.companyId, companyId),
              eq(leaveRequestsTable.userId, userId),
            ),
          )
          .orderBy(desc(leaveRequestsTable.createdAt))
          .limit(5),
        db
          .select()
          .from(fundRequestsTable)
          .where(
            and(
              eq(fundRequestsTable.companyId, companyId),
              eq(fundRequestsTable.userId, userId),
            ),
          )
          .orderBy(desc(fundRequestsTable.createdAt))
          .limit(5),
      ]);

    const requests = [
      ...leaveReqs.map((r) => ({
        id: r.id,
        kind: "leave" as const,
        label: `${r.type} leave · ${r.days} day${r.days === 1 ? "" : "s"}`,
        status: r.status,
        createdAt: r.createdAt,
      })),
      ...fundReqs.map((r) => ({
        id: r.id,
        kind: "fund" as const,
        label: `${r.purpose} · ₦${r.amount}`,
        status: r.status,
        createdAt: r.createdAt,
      })),
    ]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 8);

    res.json(
      GetEmployeeOverviewResponse.parse({
        leave,
        attendance: {
          presentDays: attendanceRows.length,
          lateCount: attendanceRows.filter((r) => r.checkInStatus === "late").length,
        },
        projects: projectRows,
        requests,
      }),
    );
  },
);

export default router;
