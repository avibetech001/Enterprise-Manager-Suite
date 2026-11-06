import assert from "node:assert/strict";
import test from "node:test";
import {
  canReadSharedNote,
  canUseExternalNoteCode,
  canUseExternalNoteShare,
  isNoteShareRequestWithinLimits,
} from "./noteSharingAccess.ts";

test("shared notes are limited to the selected recipient and same company", () => {
  const grant = {
    recipientUserId: 204,
    companyId: 10,
    noteCompanyId: 10,
  };

  assert.equal(canReadSharedNote({ id: 204, companyId: 10 }, grant), true);
  assert.equal(
    canReadSharedNote({ id: 205, companyId: 10 }, grant),
    false,
    "another employee in the same company must not read the note",
  );
  assert.equal(
    canReadSharedNote({ id: 204, companyId: 11 }, grant),
    false,
    "a recipient identity from another company must not read the note",
  );
  assert.equal(
    canReadSharedNote(
      { id: 204, companyId: 10 },
      { ...grant, noteCompanyId: 11 },
    ),
    false,
    "a share must not cross the note's company boundary",
  );
});

test("guest codes stay tied to one active share, one requester, and one use", () => {
  const now = new Date("2026-11-06T12:00:00.000Z");
  const share = { id: 31, tokenHash: "known-hash", active: true };
  const request = {
    shareId: 31,
    requesterEmail: "guest@example.com",
    failedAttempts: 0,
    expiresAt: new Date("2026-11-07T12:00:00.000Z"),
    usedAt: null,
  };

  assert.equal(canUseExternalNoteShare(share, "known-hash"), true);
  assert.equal(canUseExternalNoteShare(share, "other-hash"), false);
  assert.equal(canUseExternalNoteShare({ ...share, active: false }, "known-hash"), false);
  assert.equal(
    canUseExternalNoteCode(request, share, "guest@example.com", now, 5),
    true,
  );
  assert.equal(
    canUseExternalNoteCode({ ...request, shareId: 32 }, share, "guest@example.com", now, 5),
    false,
    "a code request for another note's share must not grant access",
  );
  assert.equal(
    canUseExternalNoteCode(request, share, "other@example.com", now, 5),
    false,
    "the requester must use the same email address",
  );
  assert.equal(
    canUseExternalNoteCode(
      { ...request, expiresAt: new Date("2026-11-06T11:59:59.000Z") },
      share,
      "guest@example.com",
      now,
      5,
    ),
    false,
  );
  assert.equal(
    canUseExternalNoteCode({ ...request, usedAt: now }, share, "guest@example.com", now, 5),
    false,
  );
  assert.equal(
    canUseExternalNoteCode({ ...request, failedAttempts: 5 }, share, "guest@example.com", now, 5),
    false,
  );
});

test("external code requests stop at both the per-link and per-email limits", () => {
  assert.equal(isNoteShareRequestWithinLimits(9, 2, 10, 3), true);
  assert.equal(isNoteShareRequestWithinLimits(10, 1, 10, 3), false);
  assert.equal(isNoteShareRequestWithinLimits(1, 3, 10, 3), false);
});
