import assert from "node:assert/strict";
import test from "node:test";
import {
  canAccessCreativeTeam,
  canAccessPrivateConversation,
  canonicalPrivatePair,
  CREATIVE_TEAM_KEY,
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

test("only eligible creative-team employees can access the role room and attachments", () => {
  const allowedTitles = [
    "Brand Manager",
    "Social Media Manager",
    "Copywriter",
    "Designer",
    "Team Lead",
  ];

  for (const [index, jobTitle] of allowedTitles.entries()) {
    assert.equal(
      canAccessCreativeTeam(
        {
          id: 400 + index,
          companyId,
          role: "employee",
          status: "active",
          archived: false,
          jobTitle,
        },
        companyId,
        CREATIVE_TEAM_KEY,
      ),
      true,
      `${jobTitle} should be eligible`,
    );
  }

  for (const deniedUser of [
    { role: "employee", status: "active", archived: false, jobTitle: "Accountant" },
    { role: "hr", status: "active", archived: false, jobTitle: "Designer" },
    { role: "employee", status: "inactive", archived: false, jobTitle: "Designer" },
    { role: "employee", status: "active", archived: true, jobTitle: "Designer" },
  ]) {
    assert.equal(
      canAccessCreativeTeam(
        { id: 500, companyId, ...deniedUser },
        companyId,
        CREATIVE_TEAM_KEY,
      ),
      false,
      JSON.stringify(deniedUser),
    );
  }
});

test("creative-team access is company-scoped and tied to the intended room", () => {
  const designer = {
    id: 601,
    companyId,
    role: "employee",
    status: "active",
    archived: false,
    jobTitle: "Designer",
  };
  assert.equal(
    canAccessCreativeTeam(designer, companyId + 1, CREATIVE_TEAM_KEY),
    false,
  );
  assert.equal(
    canAccessCreativeTeam(designer, companyId, "another-team"),
    false,
  );
});

test("an authorized super admin can access only their company's creative room", () => {
  const admin = {
    id: 701,
    companyId,
    role: "super_admin",
    status: "active",
    archived: false,
  };
  assert.equal(canAccessCreativeTeam(admin, companyId, CREATIVE_TEAM_KEY), true);
  assert.equal(canAccessCreativeTeam(admin, companyId + 1, CREATIVE_TEAM_KEY), false);
});
