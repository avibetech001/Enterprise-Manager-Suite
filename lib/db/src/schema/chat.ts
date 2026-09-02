import { integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
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

// Direct messages deliberately use their own conversation/participant/message
// model so they can never be confused with company or department groups.
export const chatConversationsTable = pgTable(
  "chat_conversations",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    initiatedByUserId: integer("initiated_by_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    employeeUserId: integer("employee_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("chat_conversations_initiator_employee_unique").on(
      table.companyId,
      table.initiatedByUserId,
      table.employeeUserId,
    ),
  ],
);

export const chatConversationParticipantsTable = pgTable(
  "chat_conversation_participants",
  {
    id: serial("id").primaryKey(),
    conversationId: integer("conversation_id")
      .notNull()
      .references(() => chatConversationsTable.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("chat_conversation_participant_unique").on(
      table.conversationId,
      table.userId,
    ),
  ],
);

export const directChatMessagesTable = pgTable("direct_chat_messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id")
    .notNull()
    .references(() => chatConversationsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  body: text("body").notNull().default(""),
  filePath: text("file_path"),
  fileName: text("file_name"),
  replyToId: integer("reply_to_id"),
  kind: text("kind").notNull().default("text"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
