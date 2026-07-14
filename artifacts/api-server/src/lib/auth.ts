import type { NextFunction, Request, Response } from "express";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, usersTable, type User } from "@workspace/db";

declare module "express-session" {
  interface SessionData {
    userId?: number;
  }
}

export const PERMISSION_CATALOG = [
  {
    key: "manage_users" as const,
    label: "Manage Users",
    description:
      "Create and manage HR accounts, and control what other HR users can access.",
  },
  {
    key: "manage_employees" as const,
    label: "Manage Employees",
    description:
      "Create employee accounts, generate activation links, and edit employee records.",
  },
  {
    key: "manage_departments" as const,
    label: "Manage Departments",
    description: "Create, edit, and remove company departments.",
  },
  {
    key: "manage_company_settings" as const,
    label: "Manage Company Settings",
    description: "View and edit company profile information.",
  },
  {
    key: "manage_attendance_settings" as const,
    label: "Manage Attendance Settings",
    description: "Configure attendance policies and rules.",
  },
  {
    key: "view_reports" as const,
    label: "View Reports",
    description: "Access company reports and analytics.",
  },
];

export type PermissionKey = (typeof PERMISSION_CATALOG)[number]["key"];

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateActivationToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function emailDomain(email: string): string {
  return email.split("@")[1]?.toLowerCase() ?? "";
}

export function hasPermission(user: User, key: PermissionKey): boolean {
  if (user.role === "super_admin") return true;
  return user.permissions.includes(key);
}

// Loads the current user (if any) onto `req.currentUser` based on the
// session cookie, without requiring authentication. Mount before routes.
export async function attachCurrentUser(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const userId = req.session.userId;
  if (!userId) {
    next();
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (user && user.status === "active") {
    req.currentUser = user;
  }

  next();
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.currentUser) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  next();
}

export function requireRole(...roles: Array<User["role"]>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.currentUser) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    if (!roles.includes(req.currentUser.role)) {
      res.status(403).json({ error: "Not permitted" });
      return;
    }
    next();
  };
}

export function requireManagementPermission(key: PermissionKey) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.currentUser;
    if (!user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    if (user.role !== "super_admin" && user.role !== "hr") {
      res.status(403).json({ error: "Not permitted" });
      return;
    }
    if (!hasPermission(user, key)) {
      res.status(403).json({ error: "Not permitted" });
      return;
    }
    next();
  };
}
