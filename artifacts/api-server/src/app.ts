import express, { type Express } from "express";
import path from "node:path";
import { existsSync } from "node:fs";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "@workspace/db";
import router from "./routes";
import { logger } from "./lib/logger";
import { attachCurrentUser } from "./lib/auth";

const app: Express = express();

// Behind Replit's deployment proxy: trust X-Forwarded-* so express-session
// treats the connection as HTTPS and sets the secure cookie in production.
app.set("trust proxy", 1);

const PgSession = connectPgSimple(session);

const sessionSecret = process.env["SESSION_SECRET"];
if (!sessionSecret) {
  throw new Error("SESSION_SECRET environment variable is required.");
}

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    // The session table is created by lib/db setup; createTableIfMissing is
    // disabled because its bundled table.sql is not available in the esbuild
    // output.
    store: new PgSession({ pool, createTableIfMissing: false }),
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env["NODE_ENV"] === "production",
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    },
  }),
);
app.use(attachCurrentUser);

app.use("/api", router);

// Serve the built React application from the same Node.js process on cPanel.
// The default path is relative to the cPanel Application Root; it can be
// overridden with EMS_FRONTEND_DIST if the deployment layout changes.
const frontendDist =
  process.env["EMS_FRONTEND_DIST"] ||
  path.resolve(process.cwd(), "artifacts/ems/dist/public");

if (existsSync(path.join(frontendDist, "index.html"))) {
  app.use(express.static(frontendDist));

  // React Router / client-side routes should return the SPA entry point.
  // API requests are deliberately excluded so missing API routes remain 404s.
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path === "/api" || req.path.startsWith("/api/")) {
      return next();
    }

    res.sendFile(path.join(frontendDist, "index.html"), (err) => {
      if (err) next(err);
    });
  });
} else {
  logger.warn({ frontendDist }, "Built frontend not found; API-only mode");
}

export default app;
