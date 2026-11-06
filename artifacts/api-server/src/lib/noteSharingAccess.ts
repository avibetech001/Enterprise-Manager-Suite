type NoteShareViewer = {
  id: number;
  companyId: number;
};

type InternalNoteShareGrant = {
  recipientUserId: number;
  companyId: number;
  noteCompanyId: number;
};

export function canReadSharedNote(
  viewer: NoteShareViewer,
  grant: InternalNoteShareGrant,
): boolean {
  return (
    viewer.id === grant.recipientUserId &&
    viewer.companyId === grant.companyId &&
    viewer.companyId === grant.noteCompanyId
  );
}

type ExternalNoteShareGrant = {
  id: number;
  tokenHash: string;
  active: boolean;
};

export function canUseExternalNoteShare(
  share: ExternalNoteShareGrant,
  tokenHash: string,
): boolean {
  return share.active && share.tokenHash === tokenHash;
}

type ExternalNoteCodeRequest = {
  shareId: number;
  requesterEmail: string;
  failedAttempts: number;
  expiresAt: Date;
  usedAt: Date | null;
};

export function canUseExternalNoteCode(
  request: ExternalNoteCodeRequest,
  share: ExternalNoteShareGrant,
  requesterEmail: string,
  now: Date,
  maxAttempts: number,
): boolean {
  return (
    share.active &&
    request.shareId === share.id &&
    request.requesterEmail === requesterEmail &&
    request.usedAt === null &&
    request.expiresAt.getTime() > now.getTime() &&
    request.failedAttempts < maxAttempts
  );
}

export function isNoteShareRequestWithinLimits(
  linkRequestCount: number,
  emailRequestCount: number,
  maxLinkRequests: number,
  maxEmailRequests: number,
): boolean {
  return (
    linkRequestCount < maxLinkRequests &&
    emailRequestCount < maxEmailRequests
  );
}
