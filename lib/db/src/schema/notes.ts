import {
  boolean,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
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

export const noteInternalSharesTable = pgTable(
  "note_internal_shares",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    noteId: integer("note_id")
      .notNull()
      .references(() => noteDraftsTable.id, { onDelete: "cascade" }),
    ownerUserId: integer("owner_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    recipientUserId: integer("recipient_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("note_internal_shares_note_recipient_unique").on(
      table.noteId,
      table.recipientUserId,
    ),
    index("note_internal_shares_recipient_company_idx").on(
      table.recipientUserId,
      table.companyId,
    ),
  ],
);

export const noteExternalSharesTable = pgTable(
  "note_external_shares",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    noteId: integer("note_id")
      .notNull()
      .references(() => noteDraftsTable.id, { onDelete: "cascade" }),
    ownerUserId: integer("owner_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("note_external_shares_note_unique").on(table.noteId),
    index("note_external_shares_company_owner_idx").on(
      table.companyId,
      table.ownerUserId,
    ),
  ],
);

export const noteExternalAccessRequestsTable = pgTable(
  "note_external_access_requests",
  {
    id: serial("id").primaryKey(),
    shareId: integer("share_id")
      .notNull()
      .references(() => noteExternalSharesTable.id, { onDelete: "cascade" }),
    requesterEmail: text("requester_email").notNull(),
    codeHash: text("code_hash").notNull(),
    failedAttempts: integer("failed_attempts").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
  },
  (table) => [
    index("note_external_access_requests_share_email_created_idx").on(
      table.shareId,
      table.requesterEmail,
      table.createdAt,
    ),
  ],
);

export type NoteDraft = typeof noteDraftsTable.$inferSelect;
export type NoteInternalShare = typeof noteInternalSharesTable.$inferSelect;
export type NoteExternalShare = typeof noteExternalSharesTable.$inferSelect;
export type NoteExternalAccessRequest =
  typeof noteExternalAccessRequestsTable.$inferSelect;
