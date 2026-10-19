import assert from "node:assert/strict";
import test from "node:test";
import {
  canAccessPrivateConversation,
  canonicalPrivatePair,
  findOrCreatePrivateConversation,
} from "./chatAccess.ts";

const companyId = 41;

test("employee and management users start or reuse one private conversation", async () => {
  const employeeId = 101;
  const managementId = 207;
  assert.deepEqual(
    canonicalPrivatePair(employeeId, managementId),
    canonicalPrivatePair(managementId, employeeId),
  );
  assert.deepEqual(canonicalPrivatePair(managementId, employeeId), [
    employeeId,
    managementId,
  ]);

  const conversations = new Map();
  let nextId = 1;
  let createCount = 0;
  const openConversation = (userId, otherUserId) => {
    const [firstUserId, secondUserId] = canonicalPrivatePair(userId, otherUserId);
    const key = `${companyId}:${firstUserId}:${secondUserId}`;
    return findOrCreatePrivateConversation(
      async () => conversations.get(key) ?? null,
      async () => {
        createCount += 1;
        const conversation = { id: nextId++, companyId, participantIds: [firstUserId, secondUserId] };
        conversations.set(key, conversation);
        return conversation;
      },
    );
  };

  const employeeStarted = await openConversation(employeeId, managementId);
  const managementReused = await openConversation(managementId, employeeId);
  assert.equal(employeeStarted.id, managementReused.id);
  assert.deepEqual(managementReused.participantIds, [employeeId, managementId]);
  assert.equal(createCount, 1, "the reverse request must reuse, not duplicate, the thread");
});

test("private messages and attachments are available only to participants in their company", () => {
  const participants = [101, 207];

  for (const participantId of participants) {
    assert.equal(
      canAccessPrivateConversation(
        { id: participantId, companyId },
        companyId,
        participants,
      ),
      true,
    );
  }

  assert.equal(
    canAccessPrivateConversation({ id: 302, companyId }, companyId, participants),
    false,
    "a same-company nonparticipant must not read messages or download files",
  );
  assert.equal(
    canAccessPrivateConversation(
      { id: 101, companyId: companyId + 1 },
      companyId,
      participants,
    ),
    false,
    "a participant identity from another company must not cross the company boundary",
  );
});

