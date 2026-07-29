import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { departmentsTable } from "./departments";

// role: "super_admin" (Employer) | "hr" | "employee"
// status: "active" | "pending" (employee awaiting activation) | "inactive"
export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  fullName: text("full_name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone").notNull(),
  role: text("role").notNull(),
  // Only meaningful for "hr" users. Super admins implicitly have every
  // permission; employees have none. Stored as a text array of permission
  // keys (see PermissionKey in the OpenAPI spec).
  permissions: text("permissions").array().notNull().default([]),
  // Employee-only capability: allows the employee to start (create) projects.
  canCreateProjects: boolean("can_create_projects").notNull().default(false),
  status: text("status").notNull().default("active"),
  passwordHash: text("password_hash"),
  // Employee-only fields
  departmentId: integer("department_id").references(
    () => departmentsTable.id,
    { onDelete: "set null" },
  ),
  jobTitle: text("job_title"),
  // Unique per-company human-readable employee code, e.g. EMP-0001
  employeeCode: text("employee_code"),
  // Employee records are never permanently deleted; they are archived.
  archived: boolean("archived").notNull().default(false),
  activationToken: text("activation_token").unique(),
  activationTokenExpiresAt: timestamp("activation_token_expires_at", {
    withTimezone: true,
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
