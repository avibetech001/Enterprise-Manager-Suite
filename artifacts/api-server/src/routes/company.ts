import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, companiesTable, companyHolidaysTable } from "@workspace/db";
import {
  GetCompanyResponse,
  UpdateCompanyBody,
  UpdateCompanyResponse,
  CreateHolidayBody,
  CreateHolidayResponse,
  ListHolidaysResponse,
} from "@workspace/api-zod";
import { requireAuth, requireManagementPermission } from "../lib/auth";

const router: IRouter = Router();

router.get("/company", requireAuth, async (req, res): Promise<void> => {
  const [company] = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.id, req.currentUser!.companyId));
  if (!company) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  res.json(GetCompanyResponse.parse(company));
});

router.patch(
  "/company",
  requireAuth,
  requireManagementPermission("manage_company_settings"),
  async (req, res): Promise<void> => {
    const parsed = UpdateCompanyBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [company] = await db
      .update(companiesTable)
      .set(parsed.data)
      .where(eq(companiesTable.id, req.currentUser!.companyId))
      .returning();
    if (!company) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    res.json(UpdateCompanyResponse.parse(company));
  },
);

// --- Public holidays --------------------------------------------------------

router.get("/company/holidays", requireAuth, async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(companyHolidaysTable)
    .where(eq(companyHolidaysTable.companyId, req.currentUser!.companyId))
    .orderBy(companyHolidaysTable.date);
  res.json(ListHolidaysResponse.parse(rows));
});

router.post(
  "/company/holidays",
  requireAuth,
  requireManagementPermission("manage_company_settings"),
  async (req, res): Promise<void> => {
    const parsed = CreateHolidayBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Provide a date (YYYY-MM-DD) and a name." });
      return;
    }
    const companyId = req.currentUser!.companyId;
    const { date, name } = parsed.data;
    const [existing] = await db
      .select()
      .from(companyHolidaysTable)
      .where(
        and(
          eq(companyHolidaysTable.companyId, companyId),
          eq(companyHolidaysTable.date, date),
        ),
      );
    if (existing) {
      res.status(400).json({ error: "A holiday already exists on that date." });
      return;
    }
    const [row] = await db
      .insert(companyHolidaysTable)
      .values({ companyId, date, name: name.trim() })
      .returning();
    res.status(201).json(CreateHolidayResponse.parse(row));
  },
);

router.delete(
  "/company/holidays/:id",
  requireAuth,
  requireManagementPermission("manage_company_settings"),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      res.status(404).json({ error: "Holiday not found." });
      return;
    }
    const [deleted] = await db
      .delete(companyHolidaysTable)
      .where(
        and(
          eq(companyHolidaysTable.id, id),
          eq(companyHolidaysTable.companyId, req.currentUser!.companyId),
        ),
      )
      .returning();
    if (!deleted) {
      res.status(404).json({ error: "Holiday not found." });
      return;
    }
    res.status(204).end();
  },
);

export default router;
