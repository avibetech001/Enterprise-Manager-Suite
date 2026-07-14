import { index, json, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";

// Session storage for connect-pg-simple (express-session).
// Declared here so `drizzle-kit push` never drops it as an "unknown" table.
export const sessionTable = pgTable(
  "session",
  {
    sid: varchar("sid").primaryKey(),
    sess: json("sess").notNull(),
    expire: timestamp("expire", { precision: 6 }).notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);
