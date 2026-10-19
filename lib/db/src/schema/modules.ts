import {
  boolean,
  date,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";
import { departmentsTable } from "./departments";
import { usersTable } from "./users";

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------

// One rotating check-in code per company per day. The QR encodes a URL
// containing this code; scanning it (or typing the code) checks the employee in.
export const attendanceCodesTable = pgTable("attendance_codes", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  forDate: date("for_date").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const attendanceRecordsTable = pgTable("attendance_records", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  forDate: date("for_date").notNull(),
  checkInAt: timestamp("check_in_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  checkOutAt: timestamp("check_out_at", { withTimezone: true }),
  // "on_time" | "late"
  checkInStatus: text("check_in_status"),
  // "on_time" | "early"
  checkOutStatus: text("check_out_status"),
  // Distance from the office at the moment of scanning, in meters.
  checkInDistanceM: integer("check_in_distance_m"),
  checkOutDistanceM: integer("check_out_distance_m"),
});

// Per-company attendance rules: office location + allowed radius, and the
// workday window used to flag late check-ins / early check-outs.
export const attendanceSettingsTable = pgTable("attendance_settings", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .unique()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  officeLat: text("office_lat"),
  officeLng: text("office_lng"),
  radiusMeters: integer("radius_meters").notNull().default(200),
  // JSON: { mon..sun: { mode: "office"|"remote"|"off", start?: "HH:MM", end?: "HH:MM" } }
  weeklySchedule: text("weekly_schedule"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// ---------------------------------------------------------------------------
// Leave
// ---------------------------------------------------------------------------

// type: "annual" | "sick" | "unpaid" | "compassionate" | "other"
// status: "pending" | "approved" | "rejected" | "cancelled"
export const leaveRequestsTable = pgTable("leave_requests", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  days: integer("days").notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("pending"),
  reviewNote: text("review_note"),
  reviewedBy: integer("reviewed_by").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

// status: "planning" | "active" | "on_hold" | "completed"
export const projectsTable = pgTable("projects", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").notNull().default("planning"),
  leadUserId: integer("lead_user_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  startDate: date("start_date"),
  deadline: date("deadline"),
  progress: integer("progress").notNull().default(0),
  urgent: boolean("urgent").notNull().default(false),
  submissionFilePath: text("submission_file_path"),
  submissionFileName: text("submission_file_name"),
  submissionLink: text("submission_link"),
  submissionNote: text("submission_note"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  submittedBy: integer("submitted_by").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const clientsTable = pgTable("clients", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  contactName: text("contact_name"),
  email: text("email"),
  phone: text("phone"),
  website: text("website"),
  industry: text("industry"),
  socialLinks: text("social_links"),
  summary: text("summary"),
  status: text("status").notNull().default("active"),
  createdBy: integer("created_by").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const clientMaterialsTable = pgTable("client_materials", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  clientId: integer("client_id")
    .notNull()
    .references(() => clientsTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  category: text("category").notNull(),
  description: text("description"),
  content: text("content"),
  filePath: text("file_path"),
  fileName: text("file_name"),
  contentType: text("content_type"),
  uploadedBy: integer("uploaded_by").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const projectMembersTable = pgTable("project_members", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .notNull()
    .references(() => projectsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
});

// status: "pending" | "in_progress" | "done"
export const projectDeliverablesTable = pgTable("project_deliverables", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .notNull()
    .references(() => projectsTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  dueDate: date("due_date"),
  status: text("status").notNull().default("pending"),
});

// ---------------------------------------------------------------------------
// Fund requests & requisitions
// ---------------------------------------------------------------------------

// status: "pending" | "approved" | "rejected"
export const fundRequestsTable = pgTable("fund_requests", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  amount: text("amount").notNull(),
  purpose: text("purpose").notNull(),
  details: text("details"),
  status: text("status").notNull().default("pending"),
  reviewNote: text("review_note"),
  reviewedBy: integer("reviewed_by").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// Client invoices — bills the company sends to its clients.
// status: "unpaid" | "part_paid" | "paid" | "cancelled"
export type InvoicePayment = {
  amount: number;
  date: string; // ISO timestamp
  note: string | null;
};
export type InvoiceItem = {
  description: string;
  quantity: number;
  rate: number; // unit price in naira
};
export const invoicesTable = pgTable("invoices", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  // Brand/sub-company issuing the invoice.
  issuer: text("issuer").notNull().default("fifth_element"),
  invoiceNumber: text("invoice_number").notNull(),
  clientName: text("client_name").notNull(),
  projectName: text("project_name"),
  clientAddress: text("client_address"),
  clientEmail: text("client_email"),
  clientPhone: text("client_phone"),
  // Line items: [{ description, quantity, rate }]
  items: jsonb("items").$type<InvoiceItem[]>().notNull().default([]),
  // Payments recorded against this invoice (supports part-payment)
  payments: jsonb("payments").$type<InvoicePayment[]>().notNull().default([]),
  // Grand total (balance due), numeric string e.g. "1500000.00"
  amount: text("amount").notNull(),
  status: text("status").notNull().default("unpaid"),
  statusNote: text("status_note"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  receiptSentAt: timestamp("receipt_sent_at", { withTimezone: true }),
  createdBy: integer("created_by").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// status: "pending" | "approved" | "rejected" | "fulfilled"
export const requisitionsTable = pgTable("requisitions", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  item: text("item").notNull(),
  quantity: integer("quantity").notNull().default(1),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("pending"),
  reviewNote: text("review_note"),
  reviewedBy: integer("reviewed_by").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// ---------------------------------------------------------------------------
// Company content (announcements, policies, knowledge base)
// ---------------------------------------------------------------------------

// kind: "announcement" | "policy" | "knowledge_base"
export const companyPostsTable = pgTable("company_posts", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  category: text("category"),
  title: text("title").notNull(),
  body: text("body").notNull(),
  link: text("link"),
  attachmentPath: text("attachment_path"),
  attachmentFileName: text("attachment_file_name"),
  attachmentContentType: text("attachment_content_type"),
  createdBy: integer("created_by").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// ---------------------------------------------------------------------------
// Employee queries (disciplinary: query / deduction / fine)
// ---------------------------------------------------------------------------

// category: "query" | "deduction" | "fine"
export const employeeQueriesTable = pgTable("employee_queries", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  issuedBy: integer("issued_by").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  category: text("category").notNull(),
  // Monetary amount for deductions/fines, stored as text (e.g. "5000").
  amount: text("amount"),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// period: "daily" | "weekly" | "monthly"
export const workReportsTable = pgTable("work_reports", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  departmentId: integer("department_id").references(() => departmentsTable.id, {
    onDelete: "set null",
  }),
  period: text("period").notNull(),
  // The day (daily), week start (weekly), or month start (monthly) covered.
  reportDate: date("report_date").notNull(),
  // End of the period covered (weekly/monthly reports); null for daily.
  endDate: date("end_date"),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type EmployeeQuery = typeof employeeQueriesTable.$inferSelect;
export type AttendanceRecord = typeof attendanceRecordsTable.$inferSelect;
export type LeaveRequest = typeof leaveRequestsTable.$inferSelect;
export type Project = typeof projectsTable.$inferSelect;
export type Client = typeof clientsTable.$inferSelect;
export type ClientMaterial = typeof clientMaterialsTable.$inferSelect;
export type ProjectDeliverable = typeof projectDeliverablesTable.$inferSelect;
export type FundRequest = typeof fundRequestsTable.$inferSelect;
export type Requisition = typeof requisitionsTable.$inferSelect;
export type CompanyPost = typeof companyPostsTable.$inferSelect;
