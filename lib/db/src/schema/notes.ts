import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";
import { usersTable } from "./users";

// Private dashboard drafts, with multiple notes per account.
export const noteDraftsTable = pgTable("note_drafts", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("Untitled note"),
  content: text("content").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type NoteDraft = typeof noteDraftsTable.$inferSelect;
