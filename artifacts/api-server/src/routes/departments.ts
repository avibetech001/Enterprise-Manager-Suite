import { Router, type IRouter } from "express";
import { and, count, eq } from "drizzle-orm";
import {
  db,
  departmentsTable,
  usersTable,
  employmentInfoTable,
} from "@workspace/db";
import {
  ListDepartmentsResponse,
  CreateDepartmentBody,
  CreateDepartmentResponse,
  UpdateDepartmentParams,
  UpdateDepartmentBody,
  UpdateDepartmentResponse,
  DeleteDepartmentParams,
} from "@workspace/api-zod";
import { requireAuth, requireManagementPermission } from "../lib/auth";

const router: IRouter = Router();

router.get("/departments", requireAuth, async (req, res): Promise<void> => {
  const companyId = req.currentUser!.companyId;
  const departments = await db
    .select()
    .from(departmentsTable)
    .where(eq(departmentsTable.companyId, companyId));

  const counts = await db
    .select({
      departmentId: employmentInfoTable.departmentId,
      employeeCount: count(),
    })
    .from(employmentInfoTable)
    .innerJoin(usersTable, eq(employmentInfoTable.userId, usersTable.id))
    .where(
      and(
        eq(usersTable.companyId, companyId),
        eq(usersTable.role, "employee"),
        eq(usersTable.archived, false),
      ),
    )
    .groupBy(employmentInfoTable.departmentId);

  const countByDepartment = new Map(
    counts.map((c) => [c.departmentId, c.employeeCount]),
  );

  res.json(
    ListDepartmentsResponse.parse(
      departments.map((d) => ({
        ...d,
        employeeCount: countByDepartment.get(d.id) ?? 0,
      })),
    ),
  );
});

router.post(
  "/departments",
  requireAuth,
  requireManagementPermission("manage_departments"),
  async (req, res): Promise<void> => {
    const parsed = CreateDepartmentBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [department] = await db
      .insert(departmentsTable)
      .values({
        companyId: req.currentUser!.companyId,
        name: parsed.data.name,
        description: parsed.data.description ?? "",
      })
      .returning();
    if (!department) {
      res.status(500).json({ error: "Failed to create department." });
      return;
    }
    res
      .status(201)
      .json(
        CreateDepartmentResponse.parse({ ...department, employeeCount: 0 }),
      );
  },
);

router.patch(
  "/departments/:id",
  requireAuth,
  requireManagementPermission("manage_departments"),
  async (req, res): Promise<void> => {
    const params = UpdateDepartmentParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = UpdateDepartmentBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [department] = await db
      .update(departmentsTable)
      .set(parsed.data)
      .where(
        and(
          eq(departmentsTable.id, params.data.id),
          eq(departmentsTable.companyId, req.currentUser!.companyId),
        ),
      )
      .returning();
    if (!department) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const [{ employeeCount }] = await db
      .select({ employeeCount: count() })
      .from(employmentInfoTable)
      .innerJoin(usersTable, eq(employmentInfoTable.userId, usersTable.id))
      .where(
        and(
          eq(employmentInfoTable.departmentId, department.id),
          eq(usersTable.role, "employee"),
          eq(usersTable.archived, false),
        ),
      );

    res.json(UpdateDepartmentResponse.parse({ ...department, employeeCount }));
  },
);

router.delete(
  "/departments/:id",
  requireAuth,
  requireManagementPermission("manage_departments"),
  async (req, res): Promise<void> => {
    const params = DeleteDepartmentParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [deleted] = await db
      .delete(departmentsTable)
      .where(
        and(
          eq(departmentsTable.id, params.data.id),
          eq(departmentsTable.companyId, req.currentUser!.companyId),
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

export default router;
