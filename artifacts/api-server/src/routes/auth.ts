import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, companiesTable, usersTable } from "@workspace/db";
import {
  GetSetupStatusResponse,
  CompleteSetupBody,
  CompleteSetupResponse,
  ManagementLoginBody,
  ManagementLoginResponse,
  EmployeeLoginBody,
  EmployeeLoginResponse,
  GetCurrentSessionResponse,
} from "@workspace/api-zod";
import {
  emailDomain,
  hashPassword,
  requireAuth,
  verifyPassword,
} from "../lib/auth";

const router: IRouter = Router();

router.get("/auth/setup-status", async (_req, res): Promise<void> => {
  const [company] = await db.select().from(companiesTable).limit(1);
  res.json(GetSetupStatusResponse.parse({ isSetupComplete: !!company }));
});

router.post("/auth/setup", async (req, res): Promise<void> => {
  const [existingCompany] = await db.select().from(companiesTable).limit(1);
  if (existingCompany) {
    res.status(409).json({ error: "Setup has already been completed." });
    return;
  }

  const parsed = CompleteSetupBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const input = parsed.data;

  if (input.password !== input.confirmPassword) {
    res.status(400).json({ error: "Passwords do not match." });
    return;
  }

  const domain = emailDomain(input.companyEmail);
  if (!domain) {
    res.status(400).json({ error: "Invalid company email." });
    return;
  }

  const passwordHash = await hashPassword(input.password);

  const [company] = await db
    .insert(companiesTable)
    .values({
      name: input.companyName,
      email: input.companyEmail,
      phone: input.phone,
      domain,
    })
    .returning();
  if (!company) {
    res.status(500).json({ error: "Failed to create company." });
    return;
  }

  const [user] = await db
    .insert(usersTable)
    .values({
      companyId: company.id,
      fullName: input.employerFullName,
      email: input.companyEmail.toLowerCase(),
      phone: input.phone,
      role: "super_admin",
      permissions: [],
      status: "active",
      passwordHash,
    })
    .returning();
  if (!user) {
    res.status(500).json({ error: "Failed to create super admin." });
    return;
  }

  req.session.userId = user.id;
  res.status(201).json(CompleteSetupResponse.parse({ user, company }));
});

router.post("/auth/management-login", async (req, res): Promise<void> => {
  const parsed = ManagementLoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { email, password } = parsed.data;

  const [company] = await db.select().from(companiesTable).limit(1);
  if (!company) {
    res.status(401).json({ error: "Invalid credentials." });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase()));

  if (
    !user ||
    !user.passwordHash ||
    (user.role !== "super_admin" && user.role !== "hr") ||
    user.status !== "active"
  ) {
    res.status(401).json({ error: "Invalid credentials." });
    return;
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials." });
    return;
  }

  req.session.userId = user.id;
  res.json(ManagementLoginResponse.parse({ user, company }));
});

router.post("/auth/employee-login", async (req, res): Promise<void> => {
  const parsed = EmployeeLoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { email, password } = parsed.data;

  const [company] = await db.select().from(companiesTable).limit(1);
  if (!company) {
    res.status(401).json({ error: "Invalid credentials." });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase()));

  if (!user || !user.passwordHash || user.role !== "employee") {
    res.status(401).json({ error: "Invalid credentials." });
    return;
  }

  if (user.status === "pending") {
    res.status(401).json({
      error: "This account has not been activated yet. Check your activation link.",
    });
    return;
  }
  if (user.status !== "active") {
    res.status(401).json({ error: "Invalid credentials." });
    return;
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials." });
    return;
  }

  req.session.userId = user.id;
  res.json(EmployeeLoginResponse.parse({ user, company }));
});

router.post("/auth/logout", (req, res): void => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.sendStatus(204);
  });
});

router.get(
  "/auth/me",
  requireAuth,
  async (req, res): Promise<void> => {
    const [company] = await db
      .select()
      .from(companiesTable)
      .where(eq(companiesTable.id, req.currentUser!.companyId));
    if (!company) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    res.json(
      GetCurrentSessionResponse.parse({ user: req.currentUser, company }),
    );
  },
);

export default router;
