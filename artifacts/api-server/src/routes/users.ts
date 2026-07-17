import { Router, type IRouter } from "express";
import { and, eq, ne, or } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import {
  ListManagementUsersResponse,
  CreateManagementUserBody,
  CreateManagementUserResponse,
  UpdateManagementUserParams,
  UpdateManagementUserBody,
  UpdateManagementUserResponse,
  DeleteManagementUserParams,
} from "@workspace/api-zod";
import {
  hashPassword,
  requireAuth,
  requireManagementPermission,
} from "../lib/auth";

const router: IRouter = Router();

router.get(
  "/users",
  requireAuth,
  requireManagementPermission("manage_users"),
  async (req, res): Promise<void> => {
    const users = await db
      .select()
      .from(usersTable)
      .where(
        and(
          eq(usersTable.companyId, req.currentUser!.companyId),
          or(eq(usersTable.role, "super_admin"), eq(usersTable.role, "hr")),
        ),
      );
    res.json(ListManagementUsersResponse.parse(users));
  },
);

router.post(
  "/users",
  requireAuth,
  requireManagementPermission("manage_users"),
  async (req, res): Promise<void> => {
    const parsed = CreateManagementUserBody.safeParse(req.body);
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

    const passwordHash = await hashPassword(input.password);
    const [user] = await db
      .insert(usersTable)
      .values({
        companyId: currentUser.companyId,
        fullName: input.fullName,
        email: input.email.toLowerCase(),
        phone: input.phone,
        role: "hr",
        permissions: input.permissions ?? [],
        status: "active",
        passwordHash,
      })
      .returning();
    if (!user) {
      res.status(500).json({ error: "Failed to create user." });
      return;
    }

    res.status(201).json(CreateManagementUserResponse.parse(user));
  },
);

router.patch(
  "/users/:id",
  requireAuth,
  requireManagementPermission("manage_users"),
  async (req, res): Promise<void> => {
    const params = UpdateManagementUserParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = UpdateManagementUserBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const currentUser = req.currentUser!;

    const [target] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, params.data.id));
    if (
      !target ||
      target.companyId !== currentUser.companyId ||
      (target.role !== "super_admin" && target.role !== "hr")
    ) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (target.role === "super_admin") {
      res.status(403).json({ error: "The Employer account cannot be modified here." });
      return;
    }

    const [user] = await db
      .update(usersTable)
      .set(parsed.data)
      .where(eq(usersTable.id, params.data.id))
      .returning();
    if (!user) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(UpdateManagementUserResponse.parse(user));
  },
);

router.delete(
  "/users/:id",
  requireAuth,
  requireManagementPermission("manage_users"),
  async (req, res): Promise<void> => {
    const params = DeleteManagementUserParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const currentUser = req.currentUser!;

    const [target] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, params.data.id));
    if (
      !target ||
      target.companyId !== currentUser.companyId ||
      target.role === "employee"
    ) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (target.role === "super_admin") {
      res.status(403).json({ error: "The Employer account cannot be removed." });
      return;
    }
    if (target.id === currentUser.id) {
      res.status(403).json({ error: "You cannot remove your own account." });
      return;
    }

    const [deleted] = await db
      .delete(usersTable)
      .where(eq(usersTable.id, params.data.id))
      .returning();
    if (!deleted) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.sendStatus(204);
  },
);

export default router;
