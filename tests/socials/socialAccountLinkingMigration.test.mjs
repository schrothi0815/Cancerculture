import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");
const migration = await read("supabase/migrations/20260905000100_social_account_linking_unlock_foundation.sql");
const before = await read("supabase/migrations/20260827000200_user_warning_appeal_foundation.sql");
function reader(text) {
  const start = text.indexOf("create or replace function public.get_own_notifications(");
  return text.slice(start, text.indexOf("$function$;", start) + "$function$;".length).replaceAll("\r\n", "\n");
}

test("all existing notification reader behavior is preserved verbatim", () => {
  const withoutSocial = reader(migration).split("\n")
    .filter((line) => !line.includes("when 'social_account_linking_unlocked'"))
    .join("\n");
  assert.equal(withoutSocial, reader(before));
});

test("new evidence cannot acquire source-row foreign-key locks or grant service DML", () => {
  const tables = migration.slice(migration.indexOf("create table"), migration.indexOf("create function"));
  assert.doesNotMatch(tables, /references public\.(?:voting_cycles|submissions|cycle_results|user_logs)/u);
  assert.match(tables, /primary key \(owner_discord_user_id, cycle_id\)/u);
  assert.match(tables, /owner_discord_user_id text primary key/u);
  const grants = migration.split("\n").filter((line) => line.startsWith("grant "));
  assert.deepEqual(grants.sort(), [
    "grant execute on function public.get_own_notifications(uuid,timestamptz,uuid,integer) to service_role;",
    "grant execute on function public.get_own_social_account_linking_status(uuid) to service_role;",
  ].sort());
});

test("migration does not run its backfill or alter legacy and authorization domains", () => {
  assert.doesNotMatch(migration, /^\s*(?:begin|commit|rollback)\s*;/imu);
  assert.doesNotMatch(migration, /^(?:select|call) public\.backfill_social_account_linking/imu);
  assert.doesNotMatch(migration, /(?:insert into|update|delete from|alter table) public\.(?:user_social_links|submission_social_links|social_verification_logs|capability_catalog|team_role_capabilities)\b/iu);
});

test("status RPC contains no domain writes and its signature cannot accept an owner", () => {
  const status = migration.slice(migration.indexOf("create function public.get_own_social_account_linking_status"), migration.indexOf("alter table public.social_account_qualifying_cycles owner"));
  assert.match(status, /get_own_social_account_linking_status\(p_session_id uuid\)/u);
  assert.match(status, /require_account_session\(p_session_id\)/u);
  assert.doesNotMatch(status, /\b(?:insert|update|delete|record_social_account_linking_progress|backfill_social_account_linking)\b/iu);
});
