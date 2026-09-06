// Explicit opt-in only; never consumes a configured database URL or existing cluster.
// Exercises the real new migration against dependency doubles on a fresh local server.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";

if (process.argv[2] !== "--isolated-local") throw new Error("Use --isolated-local to create a disposable local test cluster.");
const bin = process.env.POSTGRES_BIN ?? (process.platform === "win32" ? "C:/Program Files/PostgreSQL/18/bin" : "");
const binary = (name) => bin ? path.join(bin, `${name}${process.platform === "win32" ? ".exe" : ""}`) : name;
const tempRoot = realpathSync(os.tmpdir());
const directory = mkdtempSync(path.join(tempRoot, "cc-social-local-"));
const data = path.join(directory, "data");
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("PG") && !/DATABASE_URL|SUPABASE/u.test(key)));
const port = await new Promise((resolve, reject) => {
  const server = createServer(); server.once("error", reject);
  server.listen(0, "127.0.0.1", () => { const value = server.address().port; server.close(() => resolve(value)); });
});
Object.assign(env, { PGHOST: "127.0.0.1", PGPORT: String(port), PGUSER: "postgres", PGDATABASE: "postgres", PGCONNECT_TIMEOUT: "5" });
const args = ["-X", "--no-password", "-v", "ON_ERROR_STOP=1", "-qAt", "-f", "-"];
function run(name, parameters, input) {
  // A Windows postgres child can inherit pg_ctl's output pipes and keep a
  // synchronous caller waiting after pg_ctl itself has exited. Server output
  // already goes to the dedicated log; never give that child capture pipes.
  const result = spawnSync(binary(name), parameters, { env, input, encoding: "utf8", windowsHide: true, timeout: 30000,
    ...(name === "pg_ctl" ? { stdio: "ignore" } : {}) });
  if (result.error || result.status !== 0) throw new Error(`${name} failed: ${result.error?.code ?? result.stderr}`);
  return result.stdout?.trim() ?? "";
}
function sql(query) { return run("psql", args, `set statement_timeout='5s'; set lock_timeout='3s';\n${query}`); }
function value(query) { return JSON.parse(sql(query)); }
function failure(query, pattern) {
  const result = spawnSync(binary("psql"), args, { env, input: query, encoding: "utf8", windowsHide: true, timeout: 10000 });
  assert.notEqual(result.status, 0); assert.match(result.stderr, pattern);
}
function concurrent(query, applicationName = "cc_social_parallel") {
  return new Promise((resolve, reject) => {
    const child = spawn(binary("psql"), args, { env, windowsHide: true });
    let output = "", error = "";
    child.stdout.on("data", (chunk) => output += chunk); child.stderr.on("data", (chunk) => error += chunk);
    child.on("error", reject); child.on("close", (code) => code === 0 ? resolve(output.trim()) : reject(new Error(error)));
    child.stdin.end(`set application_name='${applicationName}'; set statement_timeout='5s'; set lock_timeout='3s';\n${query}`);
  });
}
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitForDatabaseState(query) {
  for (let attempt = 0; attempt < 30; attempt++) {
    if (sql(query) === "t") return;
    await delay(20);
  }
  throw new Error("Expected local concurrency barrier was not observed");
}
async function holdTransaction(query) {
  const child = spawn(binary("psql"), args, { env, windowsHide: true });
  let stderr = "";
  child.stdout.resume(); child.stderr.on("data", (chunk) => stderr += chunk);
  const done = new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(stderr)));
  });
  child.stdin.write(`set application_name='cc_social_holder'; set statement_timeout='5s'; set idle_in_transaction_session_timeout='10s'; begin; ${query}\n`);
  await waitForDatabaseState("select exists(select 1 from pg_stat_activity where application_name='cc_social_holder' and state='idle in transaction');");
  return async () => { child.stdin.end("commit;\n"); await done; };
}
let nextId = 100;
function seed(owner, count, finished = true) {
  const first = nextId; nextId += count + 10;
  sql(`insert into user_logs(discord_user_id) values ('${owner}') on conflict do nothing;
    insert into voting_cycles select n, '${finished ? "finished" : "voting_closed"}', ${finished ? "'2026-01-01'::timestamptz + n * interval '1 minute'" : "null"} from generate_series(${first},${first + count - 1}) n;
    insert into submissions select n, n, '${owner}', false, 0 from generate_series(${first},${first + count - 1}) n;
    ${finished ? `insert into cycle_results(cycle_id,submission_id,finalized_at,is_disqualified_at_finalization) select id,id,finalized_at,false from voting_cycles where id between ${first} and ${first + count - 1};` : ""}`);
  return first;
}
function count(owner) {
  return value(`select json_build_object('facts',(select count(*) from social_account_qualifying_cycles where owner_discord_user_id='${owner}'),
    'unlocks',(select count(*) from social_account_linking_unlocks where owner_discord_user_id='${owner}'),
    'events',(select count(*) from notification_events where owner_discord_user_id='${owner}'),
    'notifications',(select count(*) from account_notifications where owner_discord_user_id='${owner}'));`);
}
let checks = 0;
function check(name, callback) { return Promise.resolve().then(callback).then(() => { checks++; console.log(`PASS ${name}`); }); }
let started = false;
let primaryError;
try {
  run("initdb", ["-D", data, "-U", "postgres", "-A", "trust", "--encoding=UTF8", "--no-locale"]);
  started = true; // A failed wait can still leave a started server to stop.
  run("pg_ctl", ["-D", data, "-l", path.join(directory, "postgres.log"), "-o", `-h 127.0.0.1 -p ${port}`, "-w", "start"]);
  const migration = readFileSync(new URL("../../supabase/migrations/20260905000100_social_account_linking_unlock_foundation.sql", import.meta.url), "utf8");
  console.log(`Target: newly created loopback-only PostgreSQL; migration SHA256 ${createHash("sha256").update(migration).digest("hex")}`);
  sql(readFileSync(new URL("socialAccountLinking.local.fixture.sql", import.meta.url), "utf8"));
  sql(`begin;\n${migration}\ncommit;`);
  await check("migration replay fails without changing existing schema", () => failure(`begin;${migration}rollback;`, /SOCIAL_LINKING_BASELINE_MISMATCH/u));
  await check("four cycles and multiple submissions count once; zero votes count", () => {
    const first = seed("1001", 4);
    sql(`insert into submissions values (900001,${first},'1001',false,0);
      insert into cycle_results(cycle_id,submission_id,finalized_at,is_disqualified_at_finalization) select ${first},900001,finalized_at,false from voting_cycles where id=${first};
      select record_social_account_linking_progress('1001','historical_backfill');`);
    assert.deepEqual(count("1001"), { facts: 4, unlocks: 0, events: 0, notifications: 0 });
  });
  await check("fifth nonconsecutive cycle produces one permanent unlock and preserves base receipt", () => {
    const id = seed("1001", 1, false);
    assert.deepEqual(value(`select finalize_cycle(${id},'test');`), { alreadyFinalized: false, preserved: "base receipt" });
    assert.deepEqual(count("1001"), { facts: 5, unlocks: 1, events: 1, notifications: 1 });
    const original = sql("select row_to_json(u) from social_account_linking_unlocks u where owner_discord_user_id='1001';");
    sql(`select finalize_cycle(${id},'test'); select backfill_social_account_linking();`);
    assert.equal(sql("select row_to_json(u) from social_account_linking_unlocks u where owner_discord_user_id='1001';"), original);
  });
  await check("later DQ and earlier-timestamp evidence never revoke or redate an unlock", () => {
    const original = sql("select row_to_json(u) from social_account_linking_unlocks u where owner_discord_user_id='1001';");
    const id = seed("1001", 1);
    sql(`update submissions set is_disqualified=true where discord_user_id='1001';
      update cycle_results set finalized_at='2020-01-01' where cycle_id=${id}; update voting_cycles set finalized_at='2020-01-01' where id=${id};
      select record_social_account_linking_progress('1001','historical_backfill');`);
    assert.equal(sql("select row_to_json(u) from social_account_linking_unlocks u where owner_discord_user_id='1001';"), original);
    assert.equal(count("1001").events, 1);
  });
  await check("DQ snapshot is excluded and reinstatement before finalization counts", () => {
    const first = seed("1002", 4); const last = seed("1002", 1);
    sql(`update cycle_results set is_disqualified_at_finalization=true where cycle_id=${last}; select record_social_account_linking_progress('1002','historical_backfill');`);
    assert.equal(count("1002").unlocks, 0);
    const next = seed("1002", 1, false);
    sql(`update submissions set is_disqualified=true where id=${next}; update submissions set is_disqualified=false where id=${next}; select finalize_cycle(${next},'test');`);
    assert.equal(count("1002").unlocks, 1); assert.ok(first < next);
  });
  await check("NULL source cycle fails atomically", () => {
    const id = seed("1003", 5); sql(`update submissions set cycle_id=null where id=${id};`);
    failure("select record_social_account_linking_progress('1003','historical_backfill');", /SOCIAL_LINKING_EVIDENCE_INVALID/u);
    assert.deepEqual(count("1003"), { facts: 0, unlocks: 0, events: 0, notifications: 0 });
    sql(`update submissions set cycle_id=${id} where id=${id};`);
  });
  await check("two different cycles share fresh owner evidence after lock wait", async () => {
    seed("1004", 3); const a = seed("1004", 1, false); const b = seed("1004", 1, false);
    const release = await holdTransaction(`select finalize_cycle(${a},'test');`);
    const second = concurrent(`select finalize_cycle(${b},'test');`, "cc_social_owner_waiter");
    try {
      await waitForDatabaseState("select exists(select 1 from pg_stat_activity where application_name='cc_social_owner_waiter' and wait_event_type='Lock' and wait_event='advisory');");
    } finally { await release(); }
    await second;
    assert.deepEqual(count("1004"), { facts: 5, unlocks: 1, events: 1, notifications: 1 });
  });
  await check("same cycle concurrent replay cannot duplicate notification", async () => {
    seed("1005", 4); const id = seed("1005", 1, false);
    const release = await holdTransaction(`select finalize_cycle(${id},'test');`);
    const replay = concurrent(`select finalize_cycle(${id},'test');`, "cc_social_cycle_waiter");
    try {
      await waitForDatabaseState("select exists(select 1 from pg_stat_activity where application_name='cc_social_cycle_waiter' and wait_event_type='Lock');");
    } finally { await release(); }
    await replay;
    assert.deepEqual(count("1005"), { facts: 5, unlocks: 1, events: 1, notifications: 1 });
  });
  await check("historical backfill against finished replay avoids source-FK deadlock", async () => {
    const id = seed("1006", 5);
    const release = await holdTransaction(`select id from voting_cycles where id=${id} for update;`);
    // Backfill must finish while another session holds the source cycle row.
    // Source FKs would block here and fail the lock timeout before release.
    try { await concurrent("select record_social_account_linking_progress('1006','historical_backfill');"); }
    finally { await release(); }
    await concurrent(`select finalize_cycle(${id},'test');`);
    assert.deepEqual(count("1006"), { facts: 5, unlocks: 1, events: 1, notifications: 1 });
  });
  await check("repeatable-read writes are explicitly rejected", () => {
    failure("begin isolation level repeatable read; select record_social_account_linking_progress('1001','historical_backfill');", /SOCIAL_LINKING_REQUIRES_READ_COMMITTED/u);
  });
  await check("failure after notification and unlock rolls the whole finalizer back", () => {
    seed("1007", 4); const id = seed("1007", 1, false);
    sql(`create function test_fail_unlock() returns trigger language plpgsql as $$ begin if new.owner_discord_user_id='1007' then raise exception 'INJECTED_AFTER_UNLOCK'; end if; return new; end; $$;
      create trigger test_fail_unlock after insert on social_account_linking_unlocks for each row execute function test_fail_unlock();`);
    failure(`select finalize_cycle(${id},'test');`, /INJECTED_AFTER_UNLOCK/u);
    assert.deepEqual(count("1007"), { facts: 0, unlocks: 0, events: 0, notifications: 0 });
    assert.equal(sql(`select status from voting_cycles where id=${id};`), "voting_closed");
    assert.equal(sql(`select count(*) from cycle_results where cycle_id=${id};`), "0");
    sql("drop trigger test_fail_unlock on social_account_linking_unlocks; drop function test_fail_unlock();");
  });
  await check("source-chain failure never runs the new producer", () => {
    seed("1008", 4); const id = seed("1008", 1, false);
    failure(`select finalize_cycle(${id},'fail_base');`, /BASE_FINALIZER_FAILED/u);
    assert.equal(count("1008").facts, 0);
  });
  await check("owner-only reads, strict ACLs and append-only evidence", () => {
    const session = "123e4567-e89b-42d3-a456-426614174000";
    sql(`insert into sessions(id,discord_user_id) values ('${session}','1001');`);
    const before = count("1001");
    assert.equal(value(`set role service_role; select get_own_social_account_linking_status('${session}');`).unlocked, true);
    assert.deepEqual(count("1001"), before);
    const notification = value(`set role service_role; select get_own_notifications('${session}');`).items[0];
    assert.equal(notification.title, "Social account linking unlocked"); assert.equal(notification.actionLabel, "Add social account");
    assert.match(notification.body, /5 eligible Cycles/u);
    const otherSession = "123e4567-e89b-42d3-a456-426614174001";
    sql(`insert into user_logs(discord_user_id) values ('1009'); insert into sessions(id,discord_user_id) values ('${otherSession}','1009');`);
    assert.deepEqual(value(`set role service_role; select get_own_social_account_linking_status('${otherSession}');`),
      { eligibleCycles: 0, requiredCycles: 5, unlocked: false, unlockedAt: null });
    failure("set role service_role; select get_own_social_account_linking_status('123e4567-e89b-42d3-a456-426614174099');", /ACCOUNT_SESSION_INVALID/u);
    sql("update user_logs set is_banned=true where discord_user_id='1009';");
    failure(`set role service_role; select get_own_social_account_linking_status('${otherSession}');`, /ACCOUNT_SESSION_INVALID/u);
    sql("update user_logs set is_banned=false where discord_user_id='1009'; insert into discord_member_state values ('1009',true);");
    failure(`set role service_role; select get_own_social_account_linking_status('${otherSession}');`, /ACCOUNT_SESSION_INVALID/u);
    failure("set role service_role; select record_social_account_linking_progress('1001','finalization');", /permission denied/u);
    failure("set role service_role; select * from social_account_linking_unlocks;", /permission denied/u);
    failure(`set role anon; select get_own_social_account_linking_status('${session}');`, /permission denied/u);
    failure("update social_account_linking_unlocks set unlocked_at=now();", /SOCIAL_LINKING_EVIDENCE_IS_IMMUTABLE/u);
    failure("delete from social_account_qualifying_cycles;", /SOCIAL_LINKING_EVIDENCE_IS_IMMUTABLE/u);
    sql(`update sessions set revoked_at=now() where id='${session}';`);
    failure(`set role service_role; select get_own_social_account_linking_status('${session}');`, /ACCOUNT_SESSION_INVALID/u);
  });
  await check("bounded backfill repeats without any Push jobs", () => {
    let cursor = null, total = 0;
    do {
      const result = value(`select backfill_social_account_linking(${cursor ? `'${cursor}'` : "null"},2);`);
      total += result.processedOwners; cursor = result.nextOwner;
    } while (cursor);
    assert.ok(total >= 8);
    assert.equal(value("select backfill_social_account_linking();").newUnlocks, 0);
    assert.equal(sql("select count(*) from push_delivery_jobs;"), "0");
  });
  console.log(`${checks} isolated PostgreSQL checks passed. DEV/LIVE were not contacted.`);
} catch (error) {
  primaryError = error;
  throw error;
} finally {
  try {
    // If shutdown fails, retain the directory rather than remove a live cluster.
    if (started) run("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"]);
    const resolved = realpathSync(directory);
    if (path.dirname(resolved) !== tempRoot || !path.basename(resolved).startsWith("cc-social-local-")) throw new Error("Unsafe test cleanup path");
    rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch (cleanupError) {
    console.error(`Local test cleanup needs attention: ${directory}`);
    if (!primaryError) throw cleanupError;
    console.error(cleanupError.message);
  }
}
