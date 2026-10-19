import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, eq } from "drizzle-orm";
import {
  CreateClientBody,
  CreateClientMaterialBody,
  CreateClientMaterialResponse,
  GetClientResponse,
  ListClientsResponseItem,
  UpdateClientBody,
} from "@workspace/api-zod";
import {
  chatConversationsTable,
  chatMessagesTable,
  clientMaterialsTable,
  clientsTable,
  db,
  directChatMessagesTable,
  projectsTable,
  usersTable,
} from "@workspace/db";
import { requireAuth, requireManagementPermission } from "../lib/auth";
import { ObjectStorageService } from "../lib/objectStorage";

const router: IRouter = Router();
const objectStorage = new ObjectStorageService();

function parseId(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toClientResponse(client: typeof clientsTable.$inferSelect) {
  return ListClientsResponseItem.parse({
    ...client,
    createdAt: toIso(client.createdAt),
    updatedAt: toIso(client.updatedAt),
  });
}

function toMaterialResponse(material: {
  id: number;
  companyId: number;
  clientId: number;
  title: string;
  category: string;
  description: string | null;
  content: string | null;
  filePath: string | null;
  fileName: string | null;
  contentType: string | null;
  uploadedBy: number | null;
  uploadedByName?: string | null;
  createdAt: Date | string;
}) {
  return CreateClientMaterialResponse.parse({
    ...material,
    uploadedByName: material.uploadedByName ?? null,
    createdAt: toIso(material.createdAt),
  });
}

async function getCompanyClient(clientId: number, companyId: number) {
  const [client] = await db
    .select()
    .from(clientsTable)
    .where(
      and(
        eq(clientsTable.id, clientId),
        eq(clientsTable.companyId, companyId),
      ),
    )
    .limit(1);
  return client;
}

router.get(
  "/clients",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const rows = await db
      .select()
      .from(clientsTable)
      .where(eq(clientsTable.companyId, req.currentUser!.companyId))
      .orderBy(asc(clientsTable.name));

    res.json(rows.map(toClientResponse));
  },
);

router.post(
  "/clients",
  requireAuth,
  requireManagementPermission("manage_projects"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = CreateClientBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid client details" });
      return;
    }

    const [client] = await db
      .insert(clientsTable)
      .values({
        ...parsed.data,
        companyId: req.currentUser!.companyId,
        createdBy: req.currentUser!.id,
      })
      .returning();

    res.status(201).json(toClientResponse(client));
  },
);

router.get(
  "/clients/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const clientId = parseId(req.params.id);
    if (!clientId) {
      res.status(404).json({ error: "Client not found" });
      return;
    }

    const client = await getCompanyClient(
      clientId,
      req.currentUser!.companyId,
    );
    if (!client) {
      res.status(404).json({ error: "Client not found" });
      return;
    }

    const rows = await db
      .select({
        id: clientMaterialsTable.id,
        companyId: clientMaterialsTable.companyId,
        clientId: clientMaterialsTable.clientId,
        title: clientMaterialsTable.title,
        category: clientMaterialsTable.category,
        description: clientMaterialsTable.description,
        content: clientMaterialsTable.content,
        filePath: clientMaterialsTable.filePath,
        fileName: clientMaterialsTable.fileName,
        contentType: clientMaterialsTable.contentType,
        uploadedBy: clientMaterialsTable.uploadedBy,
        createdAt: clientMaterialsTable.createdAt,
        uploadedByName: usersTable.fullName,
      })
      .from(clientMaterialsTable)
      .leftJoin(usersTable, eq(clientMaterialsTable.uploadedBy, usersTable.id))
      .where(
        and(
          eq(clientMaterialsTable.clientId, clientId),
          eq(clientMaterialsTable.companyId, req.currentUser!.companyId),
        ),
      )
      .orderBy(asc(clientMaterialsTable.category), asc(clientMaterialsTable.title));

    const materials = rows.map((row) => ({
      ...toMaterialResponse(row),
      uploadedByName: row.uploadedByName,
    }));

    res.json(
      GetClientResponse.parse({
        client: toClientResponse(client),
        materials,
      }),
    );
  },
);

router.patch(
  "/clients/:id",
  requireAuth,
  requireManagementPermission("manage_projects"),
  async (req: Request, res: Response): Promise<void> => {
    const clientId = parseId(req.params.id);
    const parsed = UpdateClientBody.safeParse(req.body);
    if (!clientId) {
      res.status(404).json({ error: "Client not found" });
      return;
    }
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid client details" });
      return;
    }

    const [client] = await db
      .update(clientsTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(
        and(
          eq(clientsTable.id, clientId),
          eq(clientsTable.companyId, req.currentUser!.companyId),
        ),
      )
      .returning();

    if (!client) {
      res.status(404).json({ error: "Client not found" });
      return;
    }
    res.json(toClientResponse(client));
  },
);

router.post(
  "/clients/:id/materials",
  requireAuth,
  requireManagementPermission("manage_projects"),
  async (req: Request, res: Response): Promise<void> => {
    const clientId = parseId(req.params.id);
    const parsed = CreateClientMaterialBody.safeParse(req.body);
    if (!clientId) {
      res.status(404).json({ error: "Client not found" });
      return;
    }
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid client material" });
      return;
    }

    const client = await getCompanyClient(
      clientId,
      req.currentUser!.companyId,
    );
    if (!client) {
      res.status(404).json({ error: "Client not found" });
      return;
    }
    if (client.status !== "active") {
      res.status(400).json({ error: "Archived clients cannot be updated" });
      return;
    }

    const input = parsed.data;
    const hasFile = Boolean(input.filePath);
    const hasContent = Boolean(input.content?.trim());
    if (!hasFile && !hasContent) {
      res.status(400).json({ error: "Add text content or attach a file" });
      return;
    }
    if (
      hasFile &&
      (!input.filePath!.startsWith("/objects/") ||
        !input.fileName?.trim() ||
        !input.contentType?.trim())
    ) {
      res.status(400).json({ error: "Invalid file attachment" });
      return;
    }
    if (hasFile) {
      const objectPath = input.filePath!;
      const [projectFile] = await db
        .select({ id: projectsTable.id })
        .from(projectsTable)
        .where(
          and(
            eq(projectsTable.submissionFilePath, objectPath),
            eq(projectsTable.companyId, req.currentUser!.companyId),
          ),
        )
        .limit(1);
      const [clientFile] = await db
        .select({ id: clientMaterialsTable.id })
        .from(clientMaterialsTable)
        .where(
          and(
            eq(clientMaterialsTable.filePath, objectPath),
            eq(clientMaterialsTable.companyId, req.currentUser!.companyId),
          ),
        )
        .limit(1);
      const [groupChatFile] = await db
        .select({ id: chatMessagesTable.id })
        .from(chatMessagesTable)
        .where(
          and(
            eq(chatMessagesTable.filePath, objectPath),
            eq(chatMessagesTable.companyId, req.currentUser!.companyId),
          ),
        )
        .limit(1);
      const [directChatFile] = await db
        .select({ id: directChatMessagesTable.id })
        .from(directChatMessagesTable)
        .innerJoin(
          chatConversationsTable,
          eq(
            chatConversationsTable.id,
            directChatMessagesTable.conversationId,
          ),
        )
        .where(
          and(
            eq(directChatMessagesTable.filePath, objectPath),
            eq(chatConversationsTable.companyId, req.currentUser!.companyId),
          ),
        )
        .limit(1);
      if (projectFile || clientFile || groupChatFile || directChatFile) {
        res.status(409).json({ error: "File is already attached elsewhere" });
        return;
      }
    }

    const [material] = await db
      .insert(clientMaterialsTable)
      .values({
        ...input,
        companyId: req.currentUser!.companyId,
        clientId,
        uploadedBy: req.currentUser!.id,
      })
      .returning();

    const [uploader] = await db
      .select({ fullName: usersTable.fullName })
      .from(usersTable)
      .where(eq(usersTable.id, req.currentUser!.id))
      .limit(1);

    res.status(201).json(
      toMaterialResponse({
        ...material,
        uploadedByName: uploader?.fullName ?? null,
      }),
    );
  },
);

router.delete(
  "/clients/:id/materials/:materialId",
  requireAuth,
  requireManagementPermission("manage_projects"),
  async (req: Request, res: Response): Promise<void> => {
    const clientId = parseId(req.params.id);
    const materialId = parseId(req.params.materialId);
    if (!clientId || !materialId) {
      res.status(404).json({ error: "Client material not found" });
      return;
    }

    const [material] = await db
      .select()
      .from(clientMaterialsTable)
      .where(
        and(
          eq(clientMaterialsTable.id, materialId),
          eq(clientMaterialsTable.clientId, clientId),
          eq(clientMaterialsTable.companyId, req.currentUser!.companyId),
        ),
      )
      .limit(1);
    if (!material) {
      res.status(404).json({ error: "Client material not found" });
      return;
    }

    await db
      .delete(clientMaterialsTable)
      .where(
        and(
          eq(clientMaterialsTable.id, materialId),
          eq(clientMaterialsTable.companyId, req.currentUser!.companyId),
        ),
      );

    if (material.filePath) {
      try {
        await objectStorage.deleteObjectEntity(material.filePath);
      } catch (error) {
        req.log?.error({ error, materialId }, "Unable to remove client file");
      }
    }

    res.status(204).end();
  },
);

export default router;
