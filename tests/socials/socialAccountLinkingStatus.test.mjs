import assert from "node:assert/strict";
import { mock, test } from "node:test";
import {
  isNotificationEventType, isPushEventType, buildGenericPushPayload,
} from "../../lib/notifications/pushPayload.ts";

const state = { calls: [], data: null, error: null };
mock.module(new URL("../../lib/db/admin.ts", import.meta.url), {
  namedExports: { supabaseAdmin: { async rpc(name, parameters) {
    state.calls.push({ name, parameters });
    return { data: state.data, error: state.error };
  } } },
});
const { loadOwnSocialAccountLinkingStatus } = await import("../../lib/socials/socialAccountLinkingStatus.server.ts");
const session = "123e4567-e89b-42d3-a456-426614174000";
const locked = { eligibleCycles: 4, requiredCycles: 5, unlocked: false, unlockedAt: null };

test("own progress calls only the session-bound read RPC and returns an immutable DTO", async () => {
  state.calls = []; state.error = null; state.data = locked;
  const result = await loadOwnSocialAccountLinkingStatus(session);
  assert.deepEqual(result, locked);
  assert.equal(Object.isFrozen(result), true);
  assert.deepEqual(state.calls, [{ name: "get_own_social_account_linking_status", parameters: { p_session_id: session } }]);
});

test("invalid sessions never reach the database", async () => {
  state.calls = [];
  for (const value of ["", "owner-id", "123", session + " "]) {
    await assert.rejects(loadOwnSocialAccountLinkingStatus(value), { code: "NOT_AUTHENTICATED" });
  }
  assert.equal(state.calls.length, 0);
});

test("locked, pending-backfill and permanent unlock states are distinguished", async () => {
  for (let count = 0; count <= 5; count++) {
    state.data = { ...locked, eligibleCycles: count };
    assert.equal((await loadOwnSocialAccountLinkingStatus(session)).unlocked, false);
  }
  state.data = { eligibleCycles: 5, requiredCycles: 5, unlocked: true, unlockedAt: "2026-09-05T12:00:00Z" };
  assert.deepEqual(await loadOwnSocialAccountLinkingStatus(session), state.data);
});

test("malformed and over-disclosing responses fail closed instead of showing zero progress", async () => {
  const malformed = [null, [], {}, { ...locked, owner: "private" },
    { ...locked, eligibleCycles: -1 }, { ...locked, eligibleCycles: 6 },
    { ...locked, eligibleCycles: 4.5 }, { ...locked, eligibleCycles: "4" },
    { ...locked, requiredCycles: 4 }, { ...locked, unlocked: "false" },
    { ...locked, unlocked: true }, { ...locked, unlockedAt: "2026-09-05T00:00:00Z" },
    { ...locked, eligibleCycles: 5, unlocked: true, unlockedAt: "invalid" },
  ];
  for (const value of malformed) {
    state.data = value;
    await assert.rejects(loadOwnSocialAccountLinkingStatus(session), { code: "SOCIAL_LINKING_INVALID_RESPONSE" });
  }
});

test("database failure never falls back to eligible or new-account state", async () => {
  state.error = { code: "503", message: "private diagnostic" };
  const log = mock.method(console, "error", () => {});
  await assert.rejects(loadOwnSocialAccountLinkingStatus(session), { code: "SOCIAL_LINKING_UNAVAILABLE" });
  assert.deepEqual(log.mock.calls[0].arguments, ["[SOCIAL_LINKING] status unavailable", { code: "503" }]);
  log.mock.restore(); state.error = null;
});

test("unlock is accepted in the Notification Center but never in Push", () => {
  assert.equal(isNotificationEventType("social_account_linking_unlocked"), true);
  assert.equal(isPushEventType("social_account_linking_unlocked"), false);
  assert.throws(() => buildGenericPushPayload({
    eventType: "social_account_linking_unlocked", categoryKey: "social_account_linking", notificationId: session,
  }), /PUSH_PAYLOAD_INVALID/u);
});
