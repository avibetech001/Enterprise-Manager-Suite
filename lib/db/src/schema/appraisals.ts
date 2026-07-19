import {
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";
import { usersTable } from "./users";

export interface AppraisalRating {
  criterion: string;
  score: number; // 1-5
}

// Performance appraisals: management rates an employee (scores + comments);
// the employee can view their own appraisals.
export const appraisalsTable = pgTable("appraisals", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  createdBy: integer("created_by")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  periodLabel: text("period_label").notNull().default(""),
  ratings: jsonb("ratings").$type<AppraisalRating[]>().notNull().default([]),
  overallComment: text("overall_comment").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type AppraisalRow = typeof appraisalsTable.$inferSelect;
