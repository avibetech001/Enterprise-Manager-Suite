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
  clientMaterialsTable,
  companyPostsTable,
  chatMessagesTable,
  chatTeamsTable,
  chatTeamMembersTable,
  directChatMessagesTable,
  chatConversationsTable,
  chatConversationParticipantsTable,
  employmentInfoTable,
  employeeProfilesTable,
  usersTable,
} from '@workspace/db';

import {
  ObjectNotFoundError,
  ObjectStorageService,
} from '../lib/objectStorage';
import {
  canAccessPrivateConversation,
} from '../lib/chatAccess';

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

function hasAuthenticatedSession(req: Request): boolean {
  return req.currentUser != null;
}

function getMaxUploadBytes(): number {
  const configuredLimit = Number(process.env.MAX_UPLOAD_SIZE_MB || 50);
  return Number.isFinite(configuredLimit) && configuredLimit > 0
    ? Math.floor(configuredLimit * 1024 * 1024)
    : 50 * 1024 * 1024;
}

/**
 * POST /storage/uploads/request-url
 *
 * Request a same-origin upload URL.
 * The client sends JSON metadata first, then PUTs the file to the authenticated
 * upload endpoint. The returned object path is stored in application records.
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
      if (size > getMaxUploadBytes()) {
        res.status(413).json({ error: 'File exceeds the upload size limit' });
        return;
      }

      const objectId = objectStorageService.createUploadObjectId();
      const uploadURL = `/api/storage/uploads/${objectId}`;
      const objectPath = `/objects/uploads/${objectId}`;

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
 * PUT /storage/uploads/:objectId
 *
 * Receives the file on the EMS server and stores it outside public_html.
 * This replaces Replit's presigned-object-storage upload endpoint.
 */
router.put(
  '/storage/uploads/:objectId',
  async (req: Request, res: Response) => {
    if (!hasAuthenticatedSession(req)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const objectId = req.params.objectId;
    if (typeof objectId !== 'string' || !/^[0-9a-f-]{36}$/i.test(objectId)) {
      res.status(400).json({ error: 'Invalid upload identifier' });
      return;
    }

    const maxBytes = getMaxUploadBytes();
    const contentLength = Number(req.headers['content-length'] || 0);
    if (contentLength > maxBytes) {
      res.status(413).json({ error: 'File exceeds the upload size limit' });
      return;
    }

    try {
      await objectStorageService.saveUploadedObject(
        objectId,
        req,
        String(req.headers['content-type'] || 'application/octet-stream'),
        maxBytes,
      );
      res.status(204).end();
    } catch (error) {
      req.log.error({ err: error }, 'Error saving uploaded file');
      const message = error instanceof Error ? error.message : '';
      if (message.includes('byte limit')) {
        res.status(413).json({ error: 'File exceeds the upload size limit' });
        return;
      }
      res.status(500).json({ error: 'Failed to save uploaded file' });
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

    // Object entities are project submissions, client materials, company posts,
    // or chat attachments. Only serve company-owned files (and respect chat ACLs).
    const [owningProject] = await db
      .select({ id: projectsTable.id })
      .from(projectsTable)
      .where(
        and(
          eq(projectsTable.submissionFilePath, objectPath),
          eq(projectsTable.companyId, me.companyId),
        ),
      );
    const [owningClientMaterial] = await db
      .select({ id: clientMaterialsTable.id })
      .from(clientMaterialsTable)
      .where(
        and(
          eq(clientMaterialsTable.filePath, objectPath),
          eq(clientMaterialsTable.companyId, me.companyId),
        ),
      );
    const [owningCompanyPost] = await db
      .select({ id: companyPostsTable.id })
      .from(companyPostsTable)
      .where(
        and(
          eq(companyPostsTable.attachmentPath, objectPath),
          eq(companyPostsTable.companyId, me.companyId),
        ),
      );
    let allowed = Boolean(
      owningProject || owningClientMaterial || owningCompanyPost,
    );
    if (!allowed) {
      const [chatMsg] = await db
        .select({
          id: chatMessagesTable.id,
          companyId: chatMessagesTable.companyId,
          departmentId: chatMessagesTable.departmentId,
          teamKey: chatMessagesTable.teamKey,
        })
        .from(chatMessagesTable)
        .where(
          and(
            eq(chatMessagesTable.filePath, objectPath),
            eq(chatMessagesTable.companyId, me.companyId),
          ),
        );
      if (chatMsg) {
        if (chatMsg.teamKey?.startsWith("managed-team:")) {
          const teamId = Number(chatMsg.teamKey.slice("managed-team:".length));
          if (Number.isSafeInteger(teamId) && teamId > 0) {
            const [team] = await db
              .select({ id: chatTeamsTable.id })
              .from(chatTeamsTable)
              .where(
                and(
                  eq(chatTeamsTable.id, teamId),
                  eq(chatTeamsTable.companyId, me.companyId),
                ),
              );
            if (team) {
              const [membership] = await db
                .select({ userId: chatTeamMembersTable.userId })
                .from(chatTeamMembersTable)
                .innerJoin(usersTable, eq(usersTable.id, chatTeamMembersTable.userId))
                .where(
                  and(
                    eq(chatTeamMembersTable.teamId, teamId),
                    eq(chatTeamMembersTable.userId, me.id),
                    eq(usersTable.companyId, me.companyId),
                    eq(usersTable.role, "employee"),
                    eq(usersTable.status, "active"),
                    eq(usersTable.archived, false),
                  ),
                );
              allowed =
                me.role === "super_admin" ||
                Boolean(membership);
            }
          }
        } else if (chatMsg.teamKey) {
          allowed = false;
        } else if (chatMsg.departmentId == null || me.role === "super_admin") {
          // Company-wide attachments are open to everyone in the company;
          // super admins can access every department chat's attachments.
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
      const [directMessage] = await db
        .select({
          conversationId: directChatMessagesTable.conversationId,
          companyId: chatConversationsTable.companyId,
        })
        .from(directChatMessagesTable)
        .innerJoin(
          chatConversationsTable,
          eq(chatConversationsTable.id, directChatMessagesTable.conversationId),
        )
        .where(
          and(
            eq(directChatMessagesTable.filePath, objectPath),
            eq(chatConversationsTable.companyId, me.companyId),
          ),
        );
      if (directMessage) {
        const participants = await db
          .select({ userId: chatConversationParticipantsTable.userId })
          .from(chatConversationParticipantsTable)
          .where(
            and(
              eq(chatConversationParticipantsTable.conversationId, directMessage.conversationId),
            ),
          );
        allowed = canAccessPrivateConversation(
          me,
          directMessage.companyId,
          participants.map((participant) => participant.userId),
        );
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
    if (req.query.preview === "pdf") {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "inline");
      res.setHeader("X-Content-Type-Options", "nosniff");
    }

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
