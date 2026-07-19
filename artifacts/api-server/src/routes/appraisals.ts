import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, appraisalsTable, usersTable } from "@workspace/db";
import {
  CreateAppraisalBody,
  CreateAppraisalResponse,
  ListAppraisalsResponseItem,
  DeleteAppraisalResponse,
} from "@workspace/api-zod";
import { requireAuth, requireManagementPermission } from "../lib/auth";
import { notify } from "../lib/notify";

const router: IRouter = Router();

function serialize(row: {
  id: number;
  userId: number;
  userName: string | null;
  createdBy: number;
  createdByName: string | null;
  periodLabel: string;
  ratings: unknown;
  overallComment: string;
  createdAt: Date;
}) {
  return {
    id: row.id,
    userId: row.userId,
    userName: row.userName ?? "Unknown",
    createdBy: row.createdBy,
    createdByName: row.createdByName ?? "Unknown",
    periodLabel: row.periodLabel,
    ratings: row.ratings,
    overallComment: row.overallComment,
    createdAt: row.createdAt.toISOString(),
  };
}

async function listAppraisals(companyId: number, userId?: number) {
  const creator = db
    .select({ id: usersTable.id, fullName: usersTable.fullName })
    .from(usersTable)
    .as("creator");
  const conditions = [eq(appraisalsTable.companyId, companyId)];
  if (userId !== undefined) conditions.push(eq(appraisalsTable.userId, userId));
  return db
    .select({
      id: appraisalsTable.id,
      userId: appraisalsTable.userId,
      userName: usersTable.fullName,
      createdBy: appraisalsTable.createdBy,
      createdByName: creator.fullName,
      periodLabel: appraisalsTable.periodLabel,
      ratings: appraisalsTable.ratings,
      overallComment: appraisalsTable.overallComment,
      createdAt: appraisalsTable.createdAt,
    })
    .from(appraisalsTable)
    .leftJoin(usersTable, eq(usersTable.id, appraisalsTable.userId))
    .leftJoin(creator, eq(creator.id, appraisalsTable.createdBy))
    .where(and(...conditions))
    .orderBy(desc(appraisalsTable.createdAt));
}

router.get(
  "/appraisals",
  requireAuth,
  requireManagementPermission("manage_employees"),
  async (req: Request, res: Response): Promise<void> => {
    const me = req.currentUser!;
    const rows = await listAppraisals(me.companyId);
    res.json(rows.map((r) => ListAppraisalsResponseItem.parse(serialize(r))));
  },
);

router.get(
  "/appraisals/me",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const me = req.currentUser!;
    const rows = await listAppraisals(me.companyId, me.id);
    res.json(rows.map((r) => ListAppraisalsResponseItem.parse(serialize(r))));
  },
);

router.post(
  "/appraisals",
  requireAuth,
  requireManagementPermission("manage_employees"),
  async (req: Request, res: Response): Promise<void> => {
    const me = req.currentUser!;
    const parsed = CreateAppraisalBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid appraisal." });
      return;
    }
    const input = parsed.data;
    const [target] = await db
      .select({ id: usersTable.id, fullName: usersTable.fullName })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.id, input.userId),
          eq(usersTable.companyId, me.companyId),
        ),
      );
    if (!target) {
      res.status(400).json({ error: "Employee not found." });
      return;
    }
    const [inserted] = await db
      .insert(appraisalsTable)
      .values({
        companyId: me.companyId,
        userId: input.userId,
        createdBy: me.id,
        periodLabel: input.periodLabel?.trim() || "",
        ratings: input.ratings,
        overallComment: input.overallComment?.trim() || "",
      })
      .returning();

    void notify(
      me.companyId,
      "appraisal",
      `You have a new performance appraisal${
        inserted.periodLabel ? ` for ${inserted.periodLabel}` : ""
      }.`,
      input.userId,
    );

    res.json(
      CreateAppraisalResponse.parse(
        serialize({
          ...inserted,
          userName: target.fullName,
          createdByName: me.fullName,
        }),
      ),
    );
  },
);

router.delete(
  "/appraisals/:id",
  requireAuth,
  requireManagementPermission("manage_employees"),
  async (req: Request, res: Response): Promise<void> => {
    const me = req.currentUser!;
    const id = Number(req.params.id);
    const [deleted] = await db
      .delete(appraisalsTable)
      .where(
        and(
          eq(appraisalsTable.id, id),
          eq(appraisalsTable.companyId, me.companyId),
        ),
      )
      .returning();
    if (!deleted) {
      res.status(404).json({ error: "Appraisal not found." });
      return;
    }
    res.json(DeleteAppraisalResponse.parse({ ok: true }));
  },
);

export default router;
