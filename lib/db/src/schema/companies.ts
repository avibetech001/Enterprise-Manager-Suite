import { date, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const companiesTable = pgTable("companies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  // Derived from the company email domain (e.g. "5thelement.com").
  // Only accounts whose email matches this domain may log in.
  domain: text("domain").notNull(),
  vision: text("vision"),
  mission: text("mission"),
  coreValues: text("core_values"),
  annualLeaveDays: integer("annual_leave_days").notNull().default(20),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Company-managed public holidays. Dates in this list do not count as
// working days when computing leave durations.
export const companyHolidaysTable = pgTable("company_holidays", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type CompanyHoliday = typeof companyHolidaysTable.$inferSelect;

export const insertCompanySchema = createInsertSchema(companiesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type Company = typeof companiesTable.$inferSelect;
