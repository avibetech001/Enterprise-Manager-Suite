import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import {
  canAccessObject,
  getObjectAclPolicy,
  ObjectAclPolicy,
  ObjectPermission,
  setObjectAclPolicy,
  type StoredObject,
} from './objectAcl';

export class ObjectNotFoundError extends Error {
  constructor() {
    super('Object not found');
    this.name = 'ObjectNotFoundError';
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

/**
 * Local filesystem storage for non-Replit deployments.
 *
 * OBJECT_STORAGE_DIR must point to a directory outside public_html.
 * PRIVATE_OBJECT_DIR and PUBLIC_OBJECT_SEARCH_PATHS are paths relative to it.
 */
export class ObjectStorageService {
  private getStorageRoot(): string {
    const configured = process.env.OBJECT_STORAGE_DIR;
    if (!configured) {
      throw new Error('OBJECT_STORAGE_DIR is not configured.');
    }

    const root = path.resolve(configured);
    const publicHtml = path.resolve(process.env.HOME || '/home', 'public_html');
    if (root === publicHtml || root.startsWith(`${publicHtml}${path.sep}`)) {
      throw new Error('OBJECT_STORAGE_DIR must be outside public_html.');
    }
    return root;
  }

  private resolveStoragePath(relativePath: string): string {
    const root = this.getStorageRoot();
    const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
    const resolved = path.resolve(root, normalized);
    if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
      throw new Error('Invalid storage path.');
    }
    return resolved;
  }

  getPublicObjectSearchPaths(): Array<string> {
    return Array.from(
      new Set(
        (process.env.PUBLIC_OBJECT_SEARCH_PATHS || 'public')
          .split(',')
          .map((value) => value.trim().replace(/^\/+|\/+$/g, ''))
          .filter(Boolean),
      ),
    );
  }

  getPrivateObjectDir(): string {
    return (process.env.PRIVATE_OBJECT_DIR || 'private')
      .replace(/\\/g, '/')
      .replace(/^\/+|\/+$/g, '');
  }

  createUploadObjectId(): string {
    return randomUUID();
  }

  async saveUploadedObject(
    objectId: string,
    source: NodeJS.ReadableStream,
    contentType: string,
    maxBytes: number,
  ): Promise<void> {
    if (!/^[0-9a-f-]{36}$/i.test(objectId)) {
      throw new Error('Invalid upload identifier.');
    }

    const relativePath = `${this.getPrivateObjectDir()}/uploads/${objectId}`;
    const absolutePath = this.resolveStoragePath(relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true, mode: 0o700 });

    let totalBytes = 0;
    const limiter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        totalBytes += chunk.length;
        if (totalBytes > maxBytes) {
          callback(new Error(`Upload exceeds the ${maxBytes} byte limit.`));
          return;
        }
        callback(null, chunk);
      },
    });

    try {
      await pipeline(
        source as NodeJS.ReadableStream,
        limiter,
        createWriteStream(absolutePath, {
          flags: 'wx',
          mode: 0o600,
        }),
      );
      await writeFile(
        `${absolutePath}.meta.json`,
        JSON.stringify({ contentType: contentType || 'application/octet-stream' }),
        { mode: 0o600 },
      );
    } catch (error) {
      await rm(absolutePath, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  async searchPublicObject(filePath: string): Promise<StoredObject | null> {
    const safeFilePath = filePath.replace(/\\/g, '/').replace(/^\/+/, '');
    if (!safeFilePath || safeFilePath.split('/').some((part) => part === '..')) {
      return null;
    }

    for (const searchPath of this.getPublicObjectSearchPaths()) {
      const relativePath = `${searchPath}/${safeFilePath}`;
      const absolutePath = this.resolveStoragePath(relativePath);
      try {
        if ((await stat(absolutePath)).isFile()) {
          return { absolutePath, relativePath };
        }
      } catch {
        // Try the next configured public search directory.
      }
    }
    return null;
  }

  async downloadObject(
    file: StoredObject,
    cacheTtlSec: number = 3600,
  ): Promise<Response> {
    const metadata = await this.readMetadata(file);
    const aclPolicy = await getObjectAclPolicy(file);
    const isPublic = aclPolicy?.visibility === 'public';
    const fileStat = await stat(file.absolutePath);
    const nodeStream = createReadStream(file.absolutePath);
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;

    const headers: Record<string, string> = {
      'Content-Type': metadata.contentType || 'application/octet-stream',
      'Cache-Control': `${isPublic ? 'public' : 'private'}, max-age=${cacheTtlSec}`,
      'X-Content-Type-Options': 'nosniff',
    };
    headers['Content-Length'] = String(fileStat.size);
    return new Response(webStream, { headers });
  }

  async getObjectEntityFile(objectPath: string): Promise<StoredObject> {
    if (!objectPath.startsWith('/objects/')) {
      throw new ObjectNotFoundError();
    }

    const entityId = objectPath.slice('/objects/'.length);
    if (!entityId || entityId.split('/').some((part) => !part || part === '.' || part === '..')) {
      throw new ObjectNotFoundError();
    }

    const relativePath = `${this.getPrivateObjectDir()}/${entityId}`;
    const absolutePath = this.resolveStoragePath(relativePath);
    try {
      if (!(await stat(absolutePath)).isFile()) {
        throw new ObjectNotFoundError();
      }
    } catch (error) {
      if (error instanceof ObjectNotFoundError) throw error;
      throw new ObjectNotFoundError();
    }
    return { absolutePath, relativePath };
  }

  async deleteObjectEntity(objectPath: string): Promise<void> {
    try {
      const file = await this.getObjectEntityFile(objectPath);
      await rm(file.absolutePath, { force: true });
      await rm(`${file.absolutePath}.meta.json`, { force: true });
    } catch (error) {
      if (error instanceof ObjectNotFoundError) return;
      throw error;
    }
  }

  normalizeObjectEntityPath(rawPath: string): string {
    if (rawPath.startsWith('/objects/')) return rawPath;
    // Keep older Google Storage URLs readable as legacy object paths where possible.
    if (rawPath.startsWith('https://storage.googleapis.com/')) {
      const url = new URL(rawPath);
      const pathname = decodeURIComponent(url.pathname);
      const privateDir = `/${this.getPrivateObjectDir()}/`;
      if (pathname.startsWith(privateDir)) {
        return `/objects/${pathname.slice(privateDir.length)}`;
      }
    }
    return rawPath;
  }

  async trySetObjectEntityAclPolicy(
    rawPath: string,
    aclPolicy: ObjectAclPolicy,
  ): Promise<string> {
    const normalizedPath = this.normalizeObjectEntityPath(rawPath);
    if (!normalizedPath.startsWith('/objects/')) return normalizedPath;
    const objectFile = await this.getObjectEntityFile(normalizedPath);
    await setObjectAclPolicy(objectFile, aclPolicy);
    return normalizedPath;
  }

  async canAccessObjectEntity({
    userId,
    objectFile,
    requestedPermission,
  }: {
    userId?: string;
    objectFile: StoredObject;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    return canAccessObject({
      userId,
      objectFile,
      requestedPermission: requestedPermission ?? ObjectPermission.READ,
    });
  }

  private async readMetadata(file: StoredObject): Promise<{ contentType?: string }> {
    try {
      return JSON.parse(await readFile(`${file.absolutePath}.meta.json`, 'utf8'));
    } catch {
      return {};
    }
  }
}
