import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, companiesTable } from "@workspace/db";
import {
  GetCompanyResponse,
  UpdateCompanyBody,
  UpdateCompanyResponse,
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

export default router;
