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
