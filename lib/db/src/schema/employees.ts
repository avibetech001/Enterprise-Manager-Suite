import {
  boolean,
  date,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";
import { departmentsTable } from "./departments";
import { usersTable } from "./users";

// Personal details for employee accounts (1:1 with users where role = employee)
export const employeeProfilesTable = pgTable("employee_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .unique()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  otherName: text("other_name"),
  gender: text("gender"),
  dateOfBirth: date("date_of_birth"),
  nationality: text("nationality"),
  personalEmail: text("personal_email"),
  residentialAddress: text("residential_address"),
  state: text("state"),
  city: text("city"),
  profilePhotoUrl: text("profile_photo_url"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// Emergency contact (1:1 with users)
export const emergencyContactsTable = pgTable("emergency_contacts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .unique()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  relationship: text("relationship").notNull(),
  phone: text("phone").notNull(),
  address: text("address"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// Employment information (1:1 with users where role = employee)
// employmentType: "full_time" | "part_time" | "contract" | "intern"
// employmentStatus: "probation" | "active" | "on_leave" | "suspended" | "terminated"
export const employmentInfoTable = pgTable("employment_info", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .unique()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  departmentId: integer("department_id").references(
    () => departmentsTable.id,
    { onDelete: "set null" },
  ),
  jobTitle: text("job_title"),
  employmentType: text("employment_type"),
  startDate: date("start_date"),
  employmentStatus: text("employment_status").notNull().default("probation"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// Notifications. userId = null -> management feed (company-wide);
// userId set -> targeted at that employee.
export const notificationsTable = pgTable("notifications", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").references(() => usersTable.id, {
    onDelete: "cascade",
  }),
  type: text("type").notNull(),
  message: text("message").notNull(),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type EmployeeProfile = typeof employeeProfilesTable.$inferSelect;
export type EmergencyContactRow = typeof emergencyContactsTable.$inferSelect;
export type EmploymentInfo = typeof employmentInfoTable.$inferSelect;
export type NotificationRow = typeof notificationsTable.$inferSelect;
