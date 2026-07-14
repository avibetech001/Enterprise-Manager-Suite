import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, usersTable, companiesTable } from "@workspace/db";
import {
  ListEmployeesResponse,
  CreateEmployeeBody,
  CreateEmployeeResponse,
  GetEmployeeParams,
  GetEmployeeResponse,
  UpdateEmployeeParams,
  UpdateEmployeeBody,
  UpdateEmployeeResponse,
  DeleteEmployeeParams,
  ResendEmployeeActivationParams,
  ResendEmployeeActivationResponse,
  GetActivationInfoParams,
  GetActivationInfoResponse,
  ActivateEmployeeBody,
  ActivateEmployeeResponse,
} from "@workspace/api-zod";
import { departmentsTable } from "@workspace/db";
import {
  generateActivationToken,
  hashPassword,
  requireAuth,
  requireManagementPermission,
} from "../lib/auth";

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

const router: IRouter = Router();

const ACTIVATION_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function activationLinkFor(token: string): string {
  const host = process.env["REPLIT_DEV_DOMAIN"];
  const base = host ? `https://${host}` : "";
  return `${base}/activate/${token}`;
}

function serializeEmployee(user: typeof usersTable.$inferSelect) {
  return {
    ...user,
    activationLink:
      user.status === "pending" && user.activationToken
        ? activationLinkFor(user.activationToken)
        : null,
  };
}

router.get(
  "/employees",
  requireAuth,
  requireManagementPermission("manage_employees"),
  async (req, res): Promise<void> => {
    const employees = await db
      .select()
      .from(usersTable)
      .where(
        and(
          eq(usersTable.companyId, req.currentUser!.companyId),
          eq(usersTable.role, "employee"),
        ),
      );
    res.json(ListEmployeesResponse.parse(employees.map(serializeEmployee)));
  },
);

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

    const [existing] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, input.email.toLowerCase()));
    if (existing) {
      res.status(409).json({ error: "Email already in use." });
      return;
    }

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

    const activationToken = generateActivationToken();
    const [employee] = await db
      .insert(usersTable)
      .values({
        companyId: currentUser.companyId,
        fullName: input.fullName,
        email: input.email.toLowerCase(),
        phone: input.phone,
        role: "employee",
        permissions: [],
        status: "pending",
        departmentId: input.departmentId ?? null,
        jobTitle: input.jobTitle ?? null,
        activationToken,
        activationTokenExpiresAt: new Date(
          Date.now() + ACTIVATION_TOKEN_TTL_MS,
        ),
      })
      .returning();
    if (!employee) {
      res.status(500).json({ error: "Failed to create employee." });
      return;
    }

    res.status(201).json(CreateEmployeeResponse.parse(serializeEmployee(employee)));
  },
);

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
    const [employee] = await db
      .select()
      .from(usersTable)
      .where(
        and(
          eq(usersTable.id, params.data.id),
          eq(usersTable.companyId, req.currentUser!.companyId),
          eq(usersTable.role, "employee"),
        ),
      );
    if (!employee) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(GetEmployeeResponse.parse(serializeEmployee(employee)));
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

    if (
      parsed.data.departmentId != null &&
      !(await departmentBelongsToCompany(
        parsed.data.departmentId,
        req.currentUser!.companyId,
      ))
    ) {
      res.status(400).json({ error: "Invalid department." });
      return;
    }

    const [employee] = await db
      .update(usersTable)
      .set(parsed.data)
      .where(
        and(
          eq(usersTable.id, params.data.id),
          eq(usersTable.companyId, req.currentUser!.companyId),
          eq(usersTable.role, "employee"),
        ),
      )
      .returning();
    if (!employee) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(UpdateEmployeeResponse.parse(serializeEmployee(employee)));
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
    const [deleted] = await db
      .delete(usersTable)
      .where(
        and(
          eq(usersTable.id, params.data.id),
          eq(usersTable.companyId, req.currentUser!.companyId),
          eq(usersTable.role, "employee"),
        ),
      )
      .returning();
    if (!deleted) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.sendStatus(204);
  },
);

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
    const [existing] = await db
      .select()
      .from(usersTable)
      .where(
        and(
          eq(usersTable.id, params.data.id),
          eq(usersTable.companyId, req.currentUser!.companyId),
          eq(usersTable.role, "employee"),
        ),
      );
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const activationToken = generateActivationToken();
    const [employee] = await db
      .update(usersTable)
      .set({
        activationToken,
        activationTokenExpiresAt: new Date(
          Date.now() + ACTIVATION_TOKEN_TTL_MS,
        ),
        status: "pending",
      })
      .where(eq(usersTable.id, params.data.id))
      .returning();
    if (!employee) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(
      ResendEmployeeActivationResponse.parse(serializeEmployee(employee)),
    );
  },
);

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
  const { token, password, confirmPassword } = parsed.data;

  if (password !== confirmPassword) {
    res.status(400).json({ error: "Passwords do not match." });
    return;
  }

  const [employee] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.activationToken, token));

  if (
    !employee ||
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

  req.session.userId = updated.id;
  res.json(ActivateEmployeeResponse.parse({ user: updated, company }));
});

export default router;
