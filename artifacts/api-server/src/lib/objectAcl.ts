import { readFile, stat, writeFile } from 'node:fs/promises';

export interface StoredObject {
  absolutePath: string;
  relativePath: string;
}

const ACL_POLICY_METADATA_KEY = 'aclPolicy';

export enum ObjectAccessGroupType {}

export interface ObjectAccessGroup {
  type: ObjectAccessGroupType;
  id: string;
}

export enum ObjectPermission {
  READ = 'read',
  WRITE = 'write',
}

export interface ObjectAclRule {
  group: ObjectAccessGroup;
  permission: ObjectPermission;
}

export interface ObjectAclPolicy {
  owner: string;
  visibility: 'public' | 'private';
  aclRules?: Array<ObjectAclRule>;
}

function isPermissionAllowed(
  requested: ObjectPermission,
  granted: ObjectPermission,
): boolean {
  if (requested === ObjectPermission.READ) {
    return [ObjectPermission.READ, ObjectPermission.WRITE].includes(granted);
  }
  return granted === ObjectPermission.WRITE;
}

export async function setObjectAclPolicy(
  objectFile: StoredObject,
  aclPolicy: ObjectAclPolicy,
): Promise<void> {
  try {
    if (!(await stat(objectFile.absolutePath)).isFile()) {
      throw new Error(`Object not found: ${objectFile.relativePath}`);
    }
  } catch {
    throw new Error(`Object not found: ${objectFile.relativePath}`);
  }

  let metadata: Record<string, unknown> = {};
  try {
    metadata = JSON.parse(await readFile(`${objectFile.absolutePath}.meta.json`, 'utf8'));
  } catch {
    // Metadata is optional for files uploaded by older versions.
  }
  metadata[ACL_POLICY_METADATA_KEY] = aclPolicy;
  await writeFile(`${objectFile.absolutePath}.meta.json`, JSON.stringify(metadata), {
    mode: 0o600,
  });
}

export async function getObjectAclPolicy(
  objectFile: StoredObject,
): Promise<ObjectAclPolicy | null> {
  try {
    const metadata = JSON.parse(
      await readFile(`${objectFile.absolutePath}.meta.json`, 'utf8'),
    );
    return metadata?.[ACL_POLICY_METADATA_KEY] || null;
  } catch {
    return null;
  }
}

export async function canAccessObject({
  userId,
  objectFile,
  requestedPermission,
}: {
  userId?: string;
  objectFile: StoredObject;
  requestedPermission: ObjectPermission;
}): Promise<boolean> {
  const aclPolicy = await getObjectAclPolicy(objectFile);
  if (!aclPolicy) return false;

  if (
    aclPolicy.visibility === 'public' &&
    requestedPermission === ObjectPermission.READ
  ) {
    return true;
  }

  if (!userId) return false;
  if (aclPolicy.owner === userId) return true;

  // No access-group providers are configured in this deployment.
  for (const rule of aclPolicy.aclRules || []) {
    if (
      rule.group?.type === 'USER' &&
      rule.group.id === userId &&
      isPermissionAllowed(requestedPermission, rule.permission)
    ) {
      return true;
    }
  }
  return false;
}
