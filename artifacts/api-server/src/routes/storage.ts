import { Readable } from 'stream';
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from '@workspace/api-zod';
import { Router, type IRouter, type Request, type Response } from 'express';
import { and, eq } from 'drizzle-orm';
import {
  db,
  projectsTable,
  chatMessagesTable,
  employmentInfoTable,
  employeeProfilesTable,
  usersTable,
} from '@workspace/db';

import {
  ObjectNotFoundError,
  ObjectStorageService,
} from '../lib/objectStorage';

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

function hasAuthenticatedSession(req: Request): boolean {
  return req.currentUser != null;
}

/**
 * POST /storage/uploads/request-url
 *
 * Request a presigned URL for file upload.
 * The client sends JSON metadata (name, size, contentType) — NOT the file.
 * Then uploads the file directly to the returned presigned URL.
 * Requires auth middleware so public callers cannot mint write-capable URLs.
 */
router.post(
  '/storage/uploads/request-url',
  async (req: Request, res: Response) => {
    if (!hasAuthenticatedSession(req)) {
      res.status(401).json({ error: 'Unauthorized' });

      return;
    }

    const parsed = RequestUploadUrlBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Missing or invalid required fields' });
      return;
    }

    try {
      const { name, size, contentType } = parsed.data;

      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath =
        objectStorageService.normalizeObjectEntityPath(uploadURL);

      res.json(
        RequestUploadUrlResponse.parse({
          uploadURL,
          objectPath,
          metadata: { name, size, contentType },
        }),
      );
    } catch (error) {
      req.log.error({ err: error }, 'Error generating upload URL');
      res.status(500).json({ error: 'Failed to generate upload URL' });
    }
  },
);

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS.
 * These are unconditionally public — no authentication or ACL checks.
 * IMPORTANT: Always provide this endpoint when object storage is set up.
 */
router.get(
  '/storage/public-objects/*filePath',
  async (req: Request, res: Response) => {
    try {
      const raw = req.params.filePath;
      const filePath = Array.isArray(raw) ? raw.join('/') : raw;
      const file = await objectStorageService.searchPublicObject(filePath);
      if (!file) {
        res.status(404).json({ error: 'File not found' });
        return;
      }

      const response = await objectStorageService.downloadObject(file);

      res.status(response.status);
      response.headers.forEach((value, key) => res.setHeader(key, value));

      if (response.body) {
        const nodeStream = Readable.fromWeb(
          response.body as ReadableStream<Uint8Array>,
        );
        nodeStream.pipe(res);
      } else {
        res.end();
      }
    } catch (error) {
      req.log.error({ err: error }, 'Error serving public object');
      res.status(500).json({ error: 'Failed to serve public object' });
    }
  },
);

/**
 * GET /storage/objects/*
 *
 * Serve object entities from PRIVATE_OBJECT_DIR.
 * These are served from a separate path from /public-objects and can optionally
 * be protected with authentication or ACL checks based on the use case.
 */
router.get('/storage/objects/*path', async (req: Request, res: Response) => {
  try {
    // Authenticate before any object lookup so unauthenticated callers can't
    // probe which object paths exist.
    const me = req.currentUser;
    if (!me) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join('/') : raw;
    const objectPath = `/objects/${wildcardPath}`;

    // Object entities are project submissions or chat attachments: only
    // serve files that belong to the requester's company (and, for
    // department chats, that the requester is allowed to see).
    const [owningProject] = await db
      .select({ id: projectsTable.id })
      .from(projectsTable)
      .where(
        and(
          eq(projectsTable.submissionFilePath, objectPath),
          eq(projectsTable.companyId, me.companyId),
        ),
      );
    let allowed = Boolean(owningProject);
    if (!allowed) {
      const [chatMsg] = await db
        .select({
          id: chatMessagesTable.id,
          departmentId: chatMessagesTable.departmentId,
        })
        .from(chatMessagesTable)
        .where(
          and(
            eq(chatMessagesTable.filePath, objectPath),
            eq(chatMessagesTable.companyId, me.companyId),
          ),
        );
      if (chatMsg) {
        if (chatMsg.departmentId == null) {
          allowed = true;
        } else {
          const [emp] = await db
            .select({ departmentId: employmentInfoTable.departmentId })
            .from(employmentInfoTable)
            .where(eq(employmentInfoTable.userId, me.id));
          allowed = emp?.departmentId === chatMsg.departmentId;
        }
      }
    }
    if (!allowed) {
      // Profile photos: any signed-in user in the same company may view them.
      const [photoOwner] = await db
        .select({ id: employeeProfilesTable.userId })
        .from(employeeProfilesTable)
        .innerJoin(usersTable, eq(usersTable.id, employeeProfilesTable.userId))
        .where(
          and(
            eq(employeeProfilesTable.profilePhotoUrl, objectPath),
            eq(usersTable.companyId, me.companyId),
          ),
        );
      allowed = Boolean(photoOwner);
    }
    if (!allowed) {
      res.status(404).json({ error: 'Object not found' });
      return;
    }

    const objectFile =
      await objectStorageService.getObjectEntityFile(objectPath);

    const response = await objectStorageService.downloadObject(objectFile);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(
        response.body as ReadableStream<Uint8Array>,
      );
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      req.log.warn({ err: error }, 'Object not found');
      res.status(404).json({ error: 'Object not found' });
      return;
    }
    req.log.error({ err: error }, 'Error serving object');
    res.status(500).json({ error: 'Failed to serve object' });
  }
});

export default router;
