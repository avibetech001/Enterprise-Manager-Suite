import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";
import { departmentsTable } from "./departments";
import { usersTable } from "./users";

// Group chat messages. departmentId = null means the company-wide "General"
// group that every user belongs to automatically; a non-null departmentId
// means the auto-created group for that department.
export const chatMessagesTable = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  departmentId: integer("department_id").references(() => departmentsTable.id, {
    onDelete: "cascade",
  }),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  body: text("body").notNull().default(""),
  filePath: text("file_path"),
  fileName: text("file_name"),
  replyToId: integer("reply_to_id"),
  kind: text("kind").notNull().default("text"),
  mentionUserIds: integer("mention_user_ids").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type ChatMessageRow = typeof chatMessagesTable.$inferSelect;
