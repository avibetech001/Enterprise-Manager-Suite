export const CREATIVE_TEAM_GROUP_ID = "team-creative";
export const CREATIVE_TEAM_KEY = "brand-social-creative";
export const GROWTH_TEAM_GROUP_ID = "team-growth";
export const GROWTH_TEAM_KEY = "growth";

const CREATIVE_TEAM_TITLE =
  /(brand.*manager|social.*manager|copy\s*(?:writer|righter)|designer|team\s*lead|team\s*leader)/i;
const GROWTH_TEAM_TITLE = /growth/i;

export interface CreativeTeamUser {
  id: number;
  companyId: number;
  role: string;
  status: string;
  archived: boolean;
  jobTitle?: string | null;
}

export function isCreativeTeamEmployee(user: {
  role: string;
  status: string;
  archived: boolean;
  jobTitle?: string | null;
}): boolean {
  return (
    user.role === "employee" &&
    user.status === "active" &&
    !user.archived &&
    CREATIVE_TEAM_TITLE.test(user.jobTitle || "")
  );
}

export function canAccessCreativeTeam(
  user: CreativeTeamUser,
  resourceCompanyId: number,
  resourceTeamKey: string = CREATIVE_TEAM_KEY,
): boolean {
  if (
    user.companyId !== resourceCompanyId ||
    resourceTeamKey !== CREATIVE_TEAM_KEY
  ) {
    return false;
  }
  return (
    user.role === "super_admin" ||
    isCreativeTeamEmployee(user)
  );
}

export function isGrowthTeamEmployee(user: {
  role: string;
  status: string;
  archived: boolean;
  jobTitle?: string | null;
}): boolean {
  return (
    user.role === "employee" &&
    user.status === "active" &&
    !user.archived &&
    GROWTH_TEAM_TITLE.test(user.jobTitle || "")
  );
}

export function canAccessGrowthTeam(
  user: CreativeTeamUser,
  resourceCompanyId: number,
): boolean {
  if (user.companyId !== resourceCompanyId) return false;
  return user.role === "super_admin" || isGrowthTeamEmployee(user);
}

export function canonicalPrivatePair(
  firstUserId: number,
  secondUserId: number,
): [number, number] {
  return firstUserId < secondUserId
    ? [firstUserId, secondUserId]
    : [secondUserId, firstUserId];
}

export async function findOrCreatePrivateConversation<T>(
  findExisting: () => Promise<T | null>,
  create: () => Promise<T | null>,
): Promise<T | null> {
  const existing = await findExisting();
  if (existing) return existing;

  // The unique participant-pair index can reject one of two simultaneous
  // creates. Re-read after that conflict so both callers open the same thread.
  return (await create()) ?? (await findExisting());
}

export function canAccessPrivateConversation(
  user: { id: number; companyId: number },
  conversationCompanyId: number,
  participantIds: number[],
): boolean {
  return (
    user.companyId === conversationCompanyId &&
    participantIds.includes(user.id)
  );
}
