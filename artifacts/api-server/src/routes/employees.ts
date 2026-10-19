import { Router, type IRouter } from "express";
import { and, desc, eq, like } from "drizzle-orm";
import {
  db,
  usersTable,
  companiesTable,
  departmentsTable,
  chatTeamMembersTable,
  chatTeamsTable,
  employeeProfilesTable,
  emergencyContactsTable,
  employmentInfoTable,
  notificationsTable,
  userPresenceTable,
} from "@workspace/db";
import {
  ListEmployeesResponse,
  CreateEmployeeBody,
  CreateEmployeeResponse,
  GetEmployeeParams,
  GetEmployeeResponse,
  UpdateEmployeeParams,
  UpdateEmployeeBody,
  UpdateEmployeeResponse,
  ResendEmployeeActivationParams,
  ResendEmployeeActivationResponse,
  ResetEmployeePasswordParams,
  ResetEmployeePasswordBody,
  ArchiveEmployeeParams,
  DeleteEmployeeParams,
  ArchiveEmployeeResponse,
  RestoreEmployeeParams,
  RestoreEmployeeResponse,
  GetMyProfileResponse,
  UpdateMyProfileBody,
  UpdateMyProfileResponse,
  GetActivationInfoParams,
  GetActivationInfoResponse,
  ActivateEmployeeBody,
  ActivateEmployeeResponse,
} from "@workspace/api-zod";
import {
  generateActivationToken,
  hashPassword,
  requireAuth,
  requireManagementPermission,
} from "../lib/auth";
import { sendActivationEmail } from "../lib/email";

const router: IRouter = Router();

const ACTIVATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function activationLinkFor(token: string): string {
  const host =
    process.env["REPLIT_DOMAINS"]?.split(",")[0] ??
    process.env["REPLIT_DEV_DOMAIN"];
  const base = host ? `https://${host}` : "";
  return `${base}/activate/${token}`;
}

type UserRow = typeof usersTable.$inferSelect;
type ProfileRow = typeof employeeProfilesTable.$inferSelect;
type ContactRow = typeof emergencyContactsTable.$inferSelect;
type EmploymentRow = typeof employmentInfoTable.$inferSelect;

function serializeEmployee(
  user: UserRow,
  profile: ProfileRow | null,
  contact: ContactRow | null,
  employment: EmploymentRow | null,
) {
  return {
    id: user.id,
    employeeCode: user.employeeCode ?? "",
    companyId: user.companyId,
    firstName: profile?.firstName ?? user.fullName.split(" ")[0] ?? "",
    lastName:
      profile?.lastName ?? user.fullName.split(" ").slice(1).join(" ") ?? "",
    otherName: profile?.otherName ?? null,
    fullName: user.fullName,
    gender: profile?.gender ?? null,
    dateOfBirth: profile?.dateOfBirth ?? null,
    nationality: profile?.nationality ?? null,
    phone: user.phone,
    personalEmail: profile?.personalEmail ?? null,
    companyEmail: user.email,
    residentialAddress: profile?.residentialAddress ?? null,
    state: profile?.state ?? null,
    city: profile?.city ?? null,
    profilePhotoUrl: profile?.profilePhotoUrl ?? null,
    emergencyContact: contact
      ? {
          name: contact.name,
          relationship: contact.relationship,
          phone: contact.phone,
          address: contact.address ?? undefined,
        }
      : null,
    employment: {
      departmentId: employment?.departmentId ?? null,
      jobTitle: employment?.jobTitle ?? null,
      employmentType:
        (employment?.employmentType as
          | "full_time"
          | "part_time"
          | "contract"
          | "intern"
          | null) ?? null,
      startDate: employment?.startDate ?? null,
      employmentStatus: (employment?.employmentStatus ?? "probation") as
        | "probation"
        | "active"
        | "on_leave"
        | "suspended"
        | "terminated",
    },
    accountStatus: user.status as "active" | "pending" | "inactive" | "suspended",
    archived: user.archived,
    canCreateProjects: user.canCreateProjects,
    activationLink:
      user.status === "pending" && user.activationToken
        ? activationLinkFor(user.activationToken)
        : null,
    createdAt: user.createdAt,
  };
}

async function loadEmployeeRelations(userId: number) {
  const [[profile], [contact], [employment]] = await Promise.all([
    db
      .select()
      .from(employeeProfilesTable)
      .where(eq(employeeProfilesTable.userId, userId)),
    db
      .select()
      .from(emergencyContactsTable)
      .where(eq(emergencyContactsTable.userId, userId)),
    db
      .select()
      .from(employmentInfoTable)
      .where(eq(employmentInfoTable.userId, userId)),
  ]);
  return {
    profile: profile ?? null,
    contact: contact ?? null,
    employment: employment ?? null,
  };
}

async function loadFullEmployee(user: UserRow) {
  const rel = await loadEmployeeRelations(user.id);
  return serializeEmployee(user, rel.profile, rel.contact, rel.employment);
}

async function findCompanyEmployee(id: number, companyId: number) {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(
      and(
        eq(usersTable.id, id),
        eq(usersTable.companyId, companyId),
        eq(usersTable.role, "employee"),
      ),
    );
  return user ?? null;
}

async function departmentBelongsToCompany(
  departmentId: number,
  companyId: number,
): Promise<boolean> {
  const [dept] = await db
    .select()
    .from(departmentsTable)
    .where(
      and(
        eq(departmentsTable.id, departmentId),
        eq(departmentsTable.companyId, companyId),
      ),
    );
  return !!dept;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]/g, "");
}

async function generateCompanyEmail(
  firstName: string,
  lastName: string,
  companyId: number,
): Promise<string> {
  const [company] = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.id, companyId));
  const domain = company?.domain ?? "company.local";
  const base = `${slugify(firstName)}.${slugify(lastName)}`.replace(
    /^\.+|\.+$/g,
    "",
  );
  let candidate = `${base}@${domain}`;
  for (let i = 0; i < 100; i++) {
    const [existing] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, candidate));
    if (!existing) return candidate;
    candidate = `${base}${i + 1}@${domain}`;
  }
  throw new Error("Could not generate a unique company email");
}

async function notifyCompany(
  companyId: number,
  type: string,
  message: string,
  link?: string,
): Promise<void> {
  await db
    .insert(notificationsTable)
    .values({ companyId, type, message, link: link ?? null });
}

// ---------------------------------------------------------------------------
// Directory
// ---------------------------------------------------------------------------

router.get(
  "/employees",
  requireAuth,
  requireManagementPermission("manage_employees"),
  async (req, res): Promise<void> => {
    const includeArchived = req.query["includeArchived"] === "true";
    const conditions = [
      eq(usersTable.companyId, req.currentUser!.companyId),
      eq(usersTable.role, "employee"),
    ];
    if (!includeArchived) conditions.push(eq(usersTable.archived, false));

    const users = await db
      .select()
      .from(usersTable)
      .where(and(...conditions))
      .orderBy(desc(usersTable.createdAt));

    const employees = await Promise.all(users.map(loadFullEmployee));
    res.json(ListEmployeesResponse.parse(employees));
  },
);

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

router.post(
  "/employees",
  requireAuth,
  requireManagementPermission("manage_employees"),
  async (req, res): Promise<void> => {
    const parsed = CreateEmployeeBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const input = parsed.data;
    const currentUser = req.currentUser!;

    if (
      input.departmentId != null &&
      !(await departmentBelongsToCompany(
        input.departmentId,
        currentUser.companyId,
      ))
    ) {
      res.status(400).json({ error: "Invalid department." });
      return;
    }
    const companyEmail = (
      input.companyEmail?.trim() ||
      (await generateCompanyEmail(
        input.firstName,
        input.lastName,
        currentUser.companyId,
      ))
    ).toLowerCase();

    const [existing] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, companyEmail));
    if (existing) {
      res.status(409).json({ error: "Company email already in use." });
      return;
    }

    const fullName = [input.firstName, input.otherName, input.lastName]
      .filter((part) => part && part.trim())
      .join(" ");

    const activationToken = generateActivationToken();
    const created = await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(usersTable)
        .values({
          companyId: currentUser.companyId,
          fullName,
          email: companyEmail,
          phone: input.phone,
          role: "employee",
          permissions: [],
          canCreateProjects: input.canCreateProjects ?? false,
          status: "pending",
          archived: false,
          activationToken,
          activationTokenExpiresAt: new Date(
            Date.now() + ACTIVATION_TOKEN_TTL_MS,
          ),
        })
        .returning();
      if (!user) {
        throw new Error("Failed to create employee.");
      }

      const employeeCode = `EMP-${String(user.id).padStart(4, "0")}`;
      const [withCode] = await tx
        .update(usersTable)
        .set({ employeeCode })
        .where(eq(usersTable.id, user.id))
        .returning();

      await tx.insert(employeeProfilesTable).values({
        userId: user.id,
        firstName: input.firstName,
        lastName: input.lastName,
        otherName: input.otherName ?? null,
        gender: input.gender ?? null,
        dateOfBirth: input.dateOfBirth ?? null,
        nationality: input.nationality ?? null,
        personalEmail: input.personalEmail ?? null,
        residentialAddress: input.residentialAddress ?? null,
        state: input.state ?? null,
        city: input.city ?? null,
        profilePhotoUrl: input.profilePhotoUrl ?? null,
      });

      if (input.emergencyContact) {
        await tx.insert(emergencyContactsTable).values({
          userId: user.id,
          ...input.emergencyContact,
        });
      }

      await tx.insert(employmentInfoTable).values({
        userId: user.id,
        departmentId: input.departmentId ?? null,
        jobTitle: input.jobTitle ?? null,
        employmentType: input.employmentType ?? null,
        startDate: input.startDate ?? null,
        employmentStatus: input.employmentStatus ?? "probation",
      });

      return { user: withCode ?? user, employeeCode };
    });

    await notifyCompany(
      currentUser.companyId,
      "employee_created",
      `Employee account created for ${fullName} (${created.employeeCode}).`,
    );

    const emailSent = await sendActivationEmail({
      to: companyEmail,
      employeeName: fullName,
      activationLink: activationLinkFor(activationToken),
    });
    await notifyCompany(
      currentUser.companyId,
      "employee_created",
      emailSent
        ? `Activation email sent to ${companyEmail}.`
        : `Could not send activation email to ${companyEmail}. Share the activation link manually or use Resend Activation.`,
    );

    res
      .status(201)
      .json(CreateEmployeeResponse.parse(await loadFullEmployee(created.user)));
  },
);

// ---------------------------------------------------------------------------
// Employee self-service profile (must come before /employees/:id)
// ---------------------------------------------------------------------------

router.get("/me/profile", requireAuth, async (req, res): Promise<void> => {
  const currentUser = req.currentUser!;
  if (currentUser.role !== "employee") {
    res.status(401).json({ error: "Only employee accounts have a profile." });
    return;
  }
  res.json(GetMyProfileResponse.parse(await loadFullEmployee(currentUser)));
});

router.patch("/me/profile", requireAuth, async (req, res): Promise<void> => {
  const currentUser = req.currentUser!;
  if (currentUser.role !== "employee") {
    res.status(401).json({ error: "Only employee accounts have a profile." });
    return;
  }
  const parsed = UpdateMyProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const input = parsed.data;

  await db.transaction(async (tx) => {
    if (input.phone !== undefined) {
      await tx
        .update(usersTable)
        .set({ phone: input.phone })
        .where(eq(usersTable.id, currentUser.id));
    }

    const profileChanges: Partial<typeof employeeProfilesTable.$inferInsert> =
      {};
    if (input.personalEmail !== undefined)
      profileChanges.personalEmail = input.personalEmail;
    if (input.residentialAddress !== undefined)
      profileChanges.residentialAddress = input.residentialAddress;
    if (input.state !== undefined) profileChanges.state = input.state;
    if (input.city !== undefined) profileChanges.city = input.city;
    if (input.profilePhotoUrl !== undefined)
      profileChanges.profilePhotoUrl = input.profilePhotoUrl;
    if (Object.keys(profileChanges).length > 0) {
      await tx
        .update(employeeProfilesTable)
        .set(profileChanges)
        .where(eq(employeeProfilesTable.userId, currentUser.id));
    }

    if (input.emergencyContact !== undefined) {
      await tx
        .delete(emergencyContactsTable)
        .where(eq(emergencyContactsTable.userId, currentUser.id));
      if (input.emergencyContact) {
        await tx.insert(emergencyContactsTable).values({
          userId: currentUser.id,
          ...input.emergencyContact,
        });
      }
    }
  });

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, currentUser.id));
  await notifyCompany(
    currentUser.companyId,
    "employee_profile_updated",
    `${user!.fullName} updated their profile.`,
    `employees/${currentUser.id}`,
  );
  res.json(UpdateMyProfileResponse.parse(await loadFullEmployee(user!)));
});

// ---------------------------------------------------------------------------
// Read / update by id
// ---------------------------------------------------------------------------

router.get(
  "/employees/:id",
  requireAuth,
  requireManagementPermission("manage_employees"),
  async (req, res): Promise<void> => {
    const params = GetEmployeeParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const user = await findCompanyEmployee(
      params.data.id,
      req.currentUser!.companyId,
    );
    if (!user) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(GetEmployeeResponse.parse(await loadFullEmployee(user)));
  },
);

router.patch(
  "/employees/:id",
  requireAuth,
  requireManagementPermission("manage_employees"),
  async (req, res): Promise<void> => {
    const params = UpdateEmployeeParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = UpdateEmployeeBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const input = parsed.data;
    const companyId = req.currentUser!.companyId;

    const user = await findCompanyEmployee(params.data.id, companyId);
    if (!user) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    if (
      input.departmentId != null &&
      !(await departmentBelongsToCompany(input.departmentId, companyId))
    ) {
      res.status(400).json({ error: "Invalid department." });
      return;
    }
    // users table changes
    const rel = await loadEmployeeRelations(user.id);
    const firstName = input.firstName ?? rel.profile?.firstName ?? "";
    const lastName = input.lastName ?? rel.profile?.lastName ?? "";
    const otherName =
      input.otherName !== undefined
        ? input.otherName
        : (rel.profile?.otherName ?? null);
    const fullName = [firstName, otherName, lastName]
      .filter((part) => part && part.trim())
      .join(" ");

    const userChanges: Partial<typeof usersTable.$inferInsert> = {};
    if (
      input.firstName !== undefined ||
      input.lastName !== undefined ||
      input.otherName !== undefined
    ) {
      userChanges.fullName = fullName;
    }
    if (input.phone !== undefined) userChanges.phone = input.phone;
    if (input.companyEmail !== undefined) {
      const newEmail = input.companyEmail.trim().toLowerCase();
      if (!newEmail) {
        res.status(400).json({ error: "Company email cannot be empty." });
        return;
      }
      if (newEmail !== user.email) {
        const [existing] = await db
          .select({ id: usersTable.id })
          .from(usersTable)
          .where(eq(usersTable.email, newEmail));
        if (existing && existing.id !== user.id) {
          res.status(409).json({ error: "Company email already in use." });
          return;
        }
        userChanges.email = newEmail;
      }
    }
    if (input.accountStatus !== undefined)
      userChanges.status = input.accountStatus;
    if (input.canCreateProjects !== undefined)
      userChanges.canCreateProjects = input.canCreateProjects;
    await db.transaction(async (tx) => {
      if (Object.keys(userChanges).length > 0) {
        await tx
          .update(usersTable)
          .set(userChanges)
          .where(eq(usersTable.id, user.id));
      }

    // profile changes
    const profileChanges: Partial<typeof employeeProfilesTable.$inferInsert> =
      {};
    if (input.firstName !== undefined) profileChanges.firstName = input.firstName;
    if (input.lastName !== undefined) profileChanges.lastName = input.lastName;
    if (input.otherName !== undefined) profileChanges.otherName = input.otherName;
    if (input.gender !== undefined) profileChanges.gender = input.gender;
    if (input.dateOfBirth !== undefined)
      profileChanges.dateOfBirth = input.dateOfBirth;
    if (input.nationality !== undefined)
      profileChanges.nationality = input.nationality;
    if (input.personalEmail !== undefined)
      profileChanges.personalEmail = input.personalEmail;
    if (input.residentialAddress !== undefined)
      profileChanges.residentialAddress = input.residentialAddress;
    if (input.state !== undefined) profileChanges.state = input.state;
    if (input.city !== undefined) profileChanges.city = input.city;
    if (input.profilePhotoUrl !== undefined)
      profileChanges.profilePhotoUrl = input.profilePhotoUrl;
    if (Object.keys(profileChanges).length > 0) {
      if (rel.profile) {
        await tx
          .update(employeeProfilesTable)
          .set(profileChanges)
          .where(eq(employeeProfilesTable.userId, user.id));
      } else {
        await tx.insert(employeeProfilesTable).values({
          userId: user.id,
          firstName,
          lastName,
          ...profileChanges,
        });
      }
    }

    // emergency contact
    if (input.emergencyContact !== undefined) {
      await tx
        .delete(emergencyContactsTable)
        .where(eq(emergencyContactsTable.userId, user.id));
      if (input.emergencyContact) {
        await tx.insert(emergencyContactsTable).values({
          userId: user.id,
          ...input.emergencyContact,
        });
      }
    }

    // employment info
    const employmentChanges: Partial<typeof employmentInfoTable.$inferInsert> =
      {};
    if (input.departmentId !== undefined)
      employmentChanges.departmentId = input.departmentId;
    if (input.jobTitle !== undefined) employmentChanges.jobTitle = input.jobTitle;
    if (input.employmentType !== undefined)
      employmentChanges.employmentType = input.employmentType;
    if (input.startDate !== undefined)
      employmentChanges.startDate = input.startDate;
    if (input.employmentStatus !== undefined)
      employmentChanges.employmentStatus = input.employmentStatus;
    const departmentChanged =
      input.departmentId !== undefined &&
      input.departmentId !== (rel.employment?.departmentId ?? null);
    const accountDeactivated =
      input.accountStatus !== undefined && input.accountStatus !== "active";
    if (departmentChanged || accountDeactivated) {
      await tx
        .update(departmentsTable)
        .set({ teamLeadUserId: null })
        .where(eq(departmentsTable.teamLeadUserId, user.id));
    }
    if (Object.keys(employmentChanges).length > 0) {
      if (rel.employment) {
        await tx
          .update(employmentInfoTable)
          .set(employmentChanges)
          .where(eq(employmentInfoTable.userId, user.id));
      } else {
        await tx
          .insert(employmentInfoTable)
          .values({ userId: user.id, ...employmentChanges });
      }
    }
    });

    const [updated] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, user.id));

    await notifyCompany(
      user.companyId,
      "employee_profile_updated",
      `${updated!.fullName}'s employee record was updated.`,
      `employees/${user.id}`,
    );

    res.json(UpdateEmployeeResponse.parse(await loadFullEmployee(updated!)));
  },
);

// ---------------------------------------------------------------------------
// Account management actions
// ---------------------------------------------------------------------------

router.post(
  "/employees/:id/resend-activation",
  requireAuth,
  requireManagementPermission("manage_employees"),
  async (req, res): Promise<void> => {
    const params = ResendEmployeeActivationParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const user = await findCompanyEmployee(
      params.data.id,
      req.currentUser!.companyId,
    );
    if (!user) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const activationToken = generateActivationToken();
    const [updated] = await db
      .update(usersTable)
      .set({
        activationToken,
        activationTokenExpiresAt: new Date(
          Date.now() + ACTIVATION_TOKEN_TTL_MS,
        ),
        status: "pending",
        passwordHash: null,
      })
      .where(eq(usersTable.id, user.id))
      .returning();

    const emailSent = await sendActivationEmail({
      to: user.email,
      employeeName: user.fullName,
      activationLink: activationLinkFor(activationToken),
    });
    await notifyCompany(
      req.currentUser!.companyId,
      "employee_created",
      emailSent
        ? `Activation email re-sent to ${user.email}.`
        : `Could not send activation email to ${user.email}. Share the activation link manually.`,
    );

    res.json(
      ResendEmployeeActivationResponse.parse(await loadFullEmployee(updated!)),
    );
  },
);

router.post(
  "/employees/:id/reset-password",
  requireAuth,
  requireManagementPermission("manage_employees"),
  async (req, res): Promise<void> => {
    const params = ResetEmployeePasswordParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = ResetEmployeePasswordBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const user = await findCompanyEmployee(
      params.data.id,
      req.currentUser!.companyId,
    );
    if (!user) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const passwordHash = await hashPassword(parsed.data.newPassword);
    await db
      .update(usersTable)
      .set({ passwordHash })
      .where(eq(usersTable.id, user.id));
    res.sendStatus(204);
  },
);

router.post(
  "/employees/:id/archive",
  requireAuth,
  requireManagementPermission("manage_employees"),
  async (req, res): Promise<void> => {
    const params = ArchiveEmployeeParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const user = await findCompanyEmployee(
      params.data.id,
      req.currentUser!.companyId,
    );
    if (!user) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const updated = await db.transaction(async (tx) => {
      const [archivedUser] = await tx
        .update(usersTable)
        .set({ archived: true, status: "inactive" })
        .where(eq(usersTable.id, user.id))
        .returning();
      await tx
        .update(departmentsTable)
        .set({ teamLeadUserId: null })
        .where(eq(departmentsTable.teamLeadUserId, user.id));
      await tx
        .delete(chatTeamMembersTable)
        .where(eq(chatTeamMembersTable.userId, user.id));
      await tx
        .update(chatTeamsTable)
        .set({ teamLeadUserId: null })
        .where(eq(chatTeamsTable.teamLeadUserId, user.id));
      await tx
        .delete(userPresenceTable)
        .where(eq(userPresenceTable.userId, user.id));
      return archivedUser;
    });
    res.json(ArchiveEmployeeResponse.parse(await loadFullEmployee(updated)));
  },
);

router.delete(
  "/employees/:id",
  requireAuth,
  requireManagementPermission("manage_employees"),
  async (req, res): Promise<void> => {
    const params = DeleteEmployeeParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const user = await findCompanyEmployee(
      params.data.id,
      req.currentUser!.companyId,
    );
    if (!user) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    // Permanent removal; related records (attendance, leave, chat messages,
    // appraisals, ...) are removed via ON DELETE CASCADE.
    await db.transaction(async (tx) => {
      await tx
        .update(departmentsTable)
        .set({ teamLeadUserId: null })
        .where(eq(departmentsTable.teamLeadUserId, user.id));
      await tx.delete(usersTable).where(eq(usersTable.id, user.id));
    });
    await notifyCompany(
      req.currentUser!.companyId,
      "employee_deleted",
      `${user.fullName}'s employee record was permanently deleted.`,
    );
    res.sendStatus(204);
  },
);

router.post(
  "/employees/:id/restore",
  requireAuth,
  requireManagementPermission("manage_employees"),
  async (req, res): Promise<void> => {
    const params = RestoreEmployeeParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const user = await findCompanyEmployee(
      params.data.id,
      req.currentUser!.companyId,
    );
    if (!user) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const [updated] = await db
      .update(usersTable)
      .set({
        archived: false,
        status: user.passwordHash ? "active" : "pending",
      })
      .where(eq(usersTable.id, user.id))
      .returning();
    res.json(RestoreEmployeeResponse.parse(await loadFullEmployee(updated!)));
  },
);

// ---------------------------------------------------------------------------
// Activation (public)
// ---------------------------------------------------------------------------

router.get(
  "/employees/activation/:token",
  async (req, res): Promise<void> => {
    const params = GetActivationInfoParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const [employee] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.activationToken, params.data.token));

    if (
      !employee ||
      employee.archived ||
      employee.status !== "pending" ||
      !employee.activationTokenExpiresAt ||
      employee.activationTokenExpiresAt.getTime() < Date.now()
    ) {
      res.status(404).json({ error: "Invalid or expired activation link." });
      return;
    }

    const [company] = await db
      .select()
      .from(companiesTable)
      .where(eq(companiesTable.id, employee.companyId));

    res.json(
      GetActivationInfoResponse.parse({
        fullName: employee.fullName,
        email: employee.email,
        companyName: company?.name ?? "",
      }),
    );
  },
);

router.post("/employees/activate", async (req, res): Promise<void> => {
  const parsed = ActivateEmployeeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { token, password, confirmPassword, acceptPolicies } = parsed.data;

  if (password !== confirmPassword) {
    res.status(400).json({ error: "Passwords do not match." });
    return;
  }
  if (!acceptPolicies) {
    res
      .status(400)
      .json({ error: "You must accept the company policies to activate." });
    return;
  }

  const [employee] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.activationToken, token));

  if (
    !employee ||
    employee.archived ||
    employee.status !== "pending" ||
    !employee.activationTokenExpiresAt ||
    employee.activationTokenExpiresAt.getTime() < Date.now()
  ) {
    res.status(400).json({ error: "Invalid or expired activation link." });
    return;
  }

  const passwordHash = await hashPassword(password);
  const [updated] = await db
    .update(usersTable)
    .set({
      passwordHash,
      status: "active",
      activationToken: null,
      activationTokenExpiresAt: null,
    })
    .where(eq(usersTable.id, employee.id))
    .returning();
  if (!updated) {
    res.status(400).json({ error: "Invalid or expired activation link." });
    return;
  }

  const [company] = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.id, updated.companyId));
  if (!company) {
    res.status(400).json({ error: "Company not found." });
    return;
  }

  await notifyCompany(
    updated.companyId,
    "employee_activated",
    `${updated.fullName} activated their employee account.`,
  );

  req.session.userId = updated.id;
  res.json(ActivateEmployeeResponse.parse({ user: updated, company }));
});

export default router;
