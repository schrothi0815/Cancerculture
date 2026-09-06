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
let checks = 0;
const check = async (name, callback) => { await callback(); checks++; console.log(`PASS ${name}`); };
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const q = (text) => text === null ? 'null' : "'" + String(text).replaceAll("'", "''") + "'";
let nextRequest = 100;
function record(owner, subject, provider='x', locator='fixture', previous=null, version=0, request=uuid(nextRequest++), proof=uuid(nextRequest++)) {
  return `select record_social_account_identity('${uuid(owner)}','${request}',${q(provider)},${q(subject)},${q(locator)},'Fixture', '${proof}',${q(previous)},${version});`;
}
const own = (owner) => value(`set role service_role; select public.get_own_social_account_identities('${uuid(owner)}');`);
const publicLinks = (owner,surface='profile') => value(`set role service_role; select get_public_social_account_identities('${uuid(owner+20)}',${q(surface)});`);
const end = (owner,id,version=1,request=uuid(nextRequest++)) => `set role service_role;select disconnect_own_social_account_identity('${uuid(owner)}','${id}',${version},'${request}');`;
const digest = () => sql("select md5((select coalesce(jsonb_agg(to_jsonb(i) order by id)::text,'') from social_account_identities i)||(select coalesce(jsonb_agg(to_jsonb(e) order by request_id)::text,'') from social_account_identity_events e));");
let started = false, primaryError;
try {
  run('initdb',['-D',data,'-U','postgres','-A','trust','--encoding=UTF8','--no-locale']);
  started=true;
  run('pg_ctl',['-D',data,'-l',path.join(directory,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port}`,'-w','start']);
  const schemaPath=process.argv.find(a=>a.startsWith('--schema='))?.slice(9);
  if(schemaPath){
    const schema=readFileSync(schemaPath,'utf8');
    const rolesPath=process.argv.find(a=>a.startsWith('--roles='))?.slice(8);
    const roles=JSON.parse(readFileSync(rolesPath,'utf8')).filter(r=>schema.includes(r));
    sql(roles.map(r=>{assert.match(r,/^[a-z_]+$/u);return `create role ${r} nologin;`;}).join('\n')+'drop schema public cascade;create schema extensions;create extension pgcrypto with schema extensions;');
    run('psql',args,schema);
    console.log('Actual schema-only restore SHA256 '+createHash('sha256').update(schema).digest('hex'));
  }else{
    sql(readFileSync(new URL('socialAccountLinking.local.fixture.sql',import.meta.url),'utf8'));
    sql("alter table discord_member_state add column current_discord_username text, add column is_in_discord boolean default true; alter table user_logs add column current_discord_username text not null default 'Fixture', add column public_profile_id uuid default gen_random_uuid(), add column show_socials boolean not null default false, add column show_socials_on_submissions boolean not null default false;");
  }
  const foundation=readFileSync(new URL('../../supabase/migrations/20260905000100_social_account_linking_unlock_foundation.sql',import.meta.url),'utf8');
  sql(`begin;${foundation}commit;`);
  const migration=readFileSync(new URL('../../supabase/migrations/20260905000200_social_account_identity_foundation.sql',import.meta.url),'utf8');
  console.log('Isolated loopback target; identity migration SHA256 '+createHash('sha256').update(migration).digest('hex'));
  sql(`begin;${migration}commit;`);
  // Synthetic ownership eligibility exists exclusively inside this new cluster.
  for(let owner=1;owner<=9;owner++){
    sql(`insert into user_logs(discord_user_id,current_discord_username,public_profile_id) values('${owner}','Fixture','${uuid(owner+20)}');insert into sessions(id,discord_user_id) values('${uuid(owner)}','${owner}');`);
    if(owner===9)continue;
    sql(`insert into social_account_qualifying_cycles(owner_discord_user_id,cycle_id,source_submission_id,source_result_id,finalized_at) select '${owner}',n,n,n,now() from generate_series(1,5) n;
      with e as (insert into notification_events(producer_key,event_type,category_key,audience_type,owner_discord_user_id,deep_link) values('fixture-unlock-${owner}','social_account_linking_unlocked','social_account_linking','account','${owner}','/settings/profile') returning id)
      insert into social_account_linking_unlocks select '${owner}',5,now(),'historical_backfill',id from e;`);
  }
  const sourceBefore=sql("select md5((select jsonb_agg(to_jsonb(u) order by owner_discord_user_id)::text from social_account_linking_unlocks u)||(select jsonb_agg(to_jsonb(e) order by id)::text from notification_events e));");
  await check('explicit owners, RLS, no policies, exact overloads, fixed paths and minimum ACLs',()=>{
    assert.equal(sql("select count(*) from pg_class where relname in ('social_account_identities','social_account_identity_events') and relowner='postgres'::regrole and relrowsecurity;"),'2');
    assert.equal(sql("select count(*) from pg_policy where polrelid in ('social_account_identities'::regclass,'social_account_identity_events'::regclass);"),'0');
    for(const role of ['anon','authenticated','service_role','discord_bot'])for(const table of ['social_account_identities','social_account_identity_events']){
      for(const operation of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'])assert.equal(sql(`select has_table_privilege('${role}','${table}','${operation}');`),'f');
      failure(`set role ${role};select * from public.${table};`,/permission denied/u);
      failure(`set role ${role};delete from public.${table};`,/permission denied/u);
    }
    const names=['social_account_public_url','protect_social_account_identity_history','lock_social_account_identity_request','record_social_account_identity','end_social_account_identity','disconnect_own_social_account_identity','get_own_social_account_identities','get_public_social_account_identities'];
    const functions=value(`select json_agg(json_build_object('name',proname,'signature',oid::regprocedure::text,'owner',proowner='postgres'::regrole,'path',proconfig,'definer',prosecdef)) from pg_proc where pronamespace='public'::regnamespace and proname in (${names.map(q).join(',')});`);
    assert.equal(functions.length,8);
    for(const fn of functions){
      assert.equal(fn.owner,true);assert.deepEqual(fn.path,['search_path=public, pg_temp']);assert.equal(fn.definer,!['social_account_public_url','protect_social_account_identity_history','lock_social_account_identity_request'].includes(fn.name));
      const external=fn.name.startsWith('get_')||fn.name.startsWith('disconnect_');
      for(const role of ['anon','authenticated','service_role','discord_bot'])assert.equal(sql(`select has_function_privilege('${role}',${q(fn.signature)},'EXECUTE');`),external&&role==='service_role'?'t':'f');
    }
    failure('set role service_role;'+record(1,'forged'),/permission denied/u);
    failure(`set role authenticated;select public.get_own_social_account_identities('${uuid(1)}');`,/permission denied/u);
  });
  let first;
  await check('verification is internal, requires actual session and permanent unlock, and defaults private',()=>{
    const before=digest();
    failure(record(9,'locked'),/SOCIAL_IDENTITY_NOT_AVAILABLE/u);
    failure(record(99,'missing-session'),/ACCOUNT_SESSION_INVALID/u);
    assert.equal(digest(),before);
    first=value(record(1,'subject-a')).identityId;
    assert.equal(own(1)[0].identityId,first);assert.equal(own(2).length,0);assert.deepEqual(publicLinks(1),[]);
    assert.deepEqual(Object.keys(own(1)[0]).sort(),['identityId','provider','displayLabel','url','version','state','verifiedAt','endedAt'].sort());
    assert.equal(sql('select count(*) from social_account_identity_events;'),'1');
  });
  await check('invalid and revoked sessions, website and Discord bans are rejected',()=>{
    for(const owner of [8]){
      sql(`update sessions set revoked_at=now() where id='${uuid(owner)}';`);
      failure(`set role service_role;select public.get_own_social_account_identities('${uuid(owner)}');`,/ACCOUNT_SESSION_INVALID/u);
      failure(record(owner,'revoked-session'),/ACCOUNT_SESSION_INVALID/u);
      sql(`update sessions set revoked_at=null where id='${uuid(owner)}';update user_logs set is_banned=true where discord_user_id='${owner}';`);
      failure(record(owner,'banned'),/ACCOUNT_SESSION_INVALID/u);
      sql(`update user_logs set is_banned=false where discord_user_id='${owner}';insert into discord_member_state(discord_user_id,discord_ban_active,current_discord_username,is_in_discord) values('${owner}',true,'Fixture',false);`);
      failure(record(owner,'discord-banned'),/ACCOUNT_SESSION_INVALID/u);
      sql(`update discord_member_state set discord_ban_active=false where discord_user_id='${owner}';`);
    }
    failure(end(2,first),/SOCIAL_IDENTITY_NOT_AVAILABLE/u);
    failure(end(2,uuid(999)),/SOCIAL_IDENTITY_NOT_AVAILABLE/u);
    assert.equal(own(1)[0].state,'active');
  });
  await check('global provider identity uniqueness and one active link per owner/provider',()=>{
    const before=digest();
    failure(record(2,'subject-a'),/SOCIAL_IDENTITY_NOT_AVAILABLE/u);
    failure(record(1,'subject-b','x','other',first,1),/SOCIAL_IDENTITY_NOT_AVAILABLE/u);
    assert.equal(digest(),before);
  });
  await check('separate public profile/submission opt-ins and strict public DTO',()=>{
    sql("update user_logs set show_socials=true where discord_user_id='1';");
    assert.deepEqual(publicLinks(1),[{provider:'x',displayLabel:'Fixture',url:'https://x.com/fixture'}]);
    assert.deepEqual(publicLinks(1,'submission'),[]);
    sql("update user_logs set show_socials=false,show_socials_on_submissions=true where discord_user_id='1';");
    assert.deepEqual(publicLinks(1),[]);assert.equal(publicLinks(1,'submission').length,1);
    assert.deepEqual(publicLinks(1,'invalid'),[]);
  });
  await check('disconnect replay never reactivates; reconnect generation rejects stale completion and old removal',()=>{
    const request=uuid(nextRequest++),statement=end(1,first,1,request);
    const receipt=value(statement),after=digest();assert.equal(receipt.version,2);
    assert.deepEqual(value(statement),receipt);assert.equal(digest(),after);assert.deepEqual(publicLinks(1,'submission'),[]);
    failure(record(1,'subject-new'),/SOCIAL_IDENTITY_NOT_AVAILABLE/u);
    const next=value(record(1,'subject-new','x','newfixture',first,2)).identityId;
    assert.equal(own(1).length,1);assert.equal(own(1)[0].identityId,next);
    value(statement);assert.equal(own(1)[0].state,'active');
    failure(end(1,next,1,request),/SOCIAL_IDENTITY_REQUEST_INVALID/u);
    failure(end(1,first),/SOCIAL_IDENTITY_NOT_AVAILABLE/u);
    assert.equal(sql(`select count(*) from social_account_identities where id='${first}' and state='disconnected';`),'1');
    value(record(2,'subject-a')); // released provider identity can have a new owner
  });
  await check('verification receipt replay has no state effects; changed payload and reused proof fail',()=>{
    const req=uuid(nextRequest++),proof=uuid(nextRequest++);
    const statement=record(3,'subject-c','x','third',null,0,req,proof);
    const receipt=value(statement),before=digest();assert.deepEqual(value(statement),receipt);assert.equal(digest(),before);
    failure(record(3,'other-c','x','third',null,0,req,proof),/SOCIAL_IDENTITY_REQUEST_INVALID/u);
    failure(record(4,'subject-d','x','fourth',null,0,uuid(nextRequest++),proof),/SOCIAL_IDENTITY_NOT_AVAILABLE/u);
    value(end(3,receipt.identityId));const ended=digest();value(statement);assert.equal(digest(),ended);assert.equal(own(3)[0].state,'disconnected');
  });
  await check('revocation is internal, terminal, audited and immediately hidden',()=>{
    const id=own(2)[0].identityId,req=uuid(nextRequest++);
    sql("update user_logs set show_socials=true,show_socials_on_submissions=true where discord_user_id='2';");
    const statement=`select end_social_account_identity('2','${id}',1,'${req}','revoked');`;
    failure('set role service_role;'+statement,/permission denied/u);
    value(statement);const after=digest();value(statement);assert.equal(digest(),after);
    assert.equal(own(2)[0].state,'revoked');assert.deepEqual(publicLinks(2),[]);assert.deepEqual(publicLinks(2,'submission'),[]);
  });
  await check('immutable snapshots and event history resist update/delete/truncate',()=>{
    failure("update social_account_identities set display_label='changed';",/SOCIAL_IDENTITY_HISTORY_IMMUTABLE/u);
    failure("update social_account_identities set state='active',version=1,ended_at=null where state<>'active';",/SOCIAL_IDENTITY_HISTORY_IMMUTABLE/u);
    for(const table of ['social_account_identities','social_account_identity_events']){
      failure(`delete from public.${table};`,/SOCIAL_IDENTITY_HISTORY_IMMUTABLE/u);
      failure(`truncate ${table} cascade;`,/SOCIAL_IDENTITY_HISTORY_IMMUTABLE/u);
    }
    failure('update social_account_identity_events set occurred_at=now();',/SOCIAL_IDENTITY_HISTORY_IMMUTABLE/u);
  });
  await check('provider URLs reject arbitrary hosts, scripts, encoded paths and reserved endpoints',()=>{
    for(const locator of ['https://evil.invalid','//evil.invalid','a/b','a?b','a#b','a%2fb','a\\b','intent','login','i'])
      failure(record(4,'bad-url','x',locator),/SOCIAL_IDENTITY_NOT_AVAILABLE/u);
    for(const [provider,locator,url] of [['tiktok','fixture_tt','https://www.tiktok.com/@fixture_tt'],['youtube','UCabcdefghijklmnopqrstuv','https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv'],['instagram','fixture.ig','https://www.instagram.com/fixture.ig'],['facebook','fixture.fb','https://www.facebook.com/fixture.fb']]){
      const result=value(record(4,'private-'+provider,provider,locator));assert.ok(result.identityId);
      assert.equal(own(4).find(i=>i.provider===provider).url,url);
    }
  });
  await check('concurrent owners contend on the global identity constraint, one winner only',async()=>{
    const release=await holdTransaction(record(5,'race-subject'));
    const other=concurrent(record(6,'race-subject'),'cc_identity_global_waiter').then(()=>({ok:true}),error=>({error}));
    try{await waitForDatabaseState("select exists(select 1 from pg_stat_activity where application_name='cc_identity_global_waiter' and wait_event_type='Lock');");}finally{await release();}
    const result=await other;assert.match(result.error.message,/SOCIAL_IDENTITY_NOT_AVAILABLE/u);assert.equal(own(6).length,0);
    assert.equal(sql("select count(*) from social_account_identities where provider_account_id='race-subject' and state='active';"),'1');
  });
  await check('same owner different sessions serialize stale completion and concurrent request replay',async()=>{
    sql(`insert into sessions(id,discord_user_id) values('${uuid(66)}','6');`);
    const statement=record(6,'owner-race');
    const release=await holdTransaction(statement);
    const other=concurrent(record(66,'owner-race-2'),'cc_identity_owner_waiter').then(()=>({ok:true}),error=>({error}));
    try{await waitForDatabaseState("select exists(select 1 from pg_stat_activity where application_name='cc_identity_owner_waiter' and wait_event_type='Lock' and wait_event='advisory');");}finally{await release();}
    assert.match((await other).error.message,/SOCIAL_IDENTITY_NOT_AVAILABLE/u);assert.equal(own(6).length,1);
    const req=uuid(nextRequest++),proof=uuid(nextRequest++),replay=record(7,'replay-race','x','seven',null,0,req,proof);
    const release2=await holdTransaction(replay);
    const parallel=concurrent(replay,'cc_identity_replay_waiter');
    try{await waitForDatabaseState("select exists(select 1 from pg_stat_activity where application_name='cc_identity_replay_waiter' and wait_event_type='Lock');");}finally{await release2();}
    assert.deepEqual(JSON.parse(await parallel),value(replay));
  });
  await check('concurrent disconnect/revoke is terminal and stale competitor cannot add an event',async()=>{
    const id=own(6)[0].identityId;
    const release=await holdTransaction(`select end_social_account_identity('6','${id}',1,'${uuid(nextRequest++)}','disconnected');`);
    const other=concurrent(`select end_social_account_identity('6','${id}',1,'${uuid(nextRequest++)}','revoked');`,'cc_identity_end_waiter').then(()=>({ok:true}),error=>({error}));
    try{await waitForDatabaseState("select exists(select 1 from pg_stat_activity where application_name='cc_identity_end_waiter' and wait_event_type='Lock');");}finally{await release();}
    assert.match((await other).error.message,/SOCIAL_IDENTITY_NOT_AVAILABLE/u);assert.equal(own(6)[0].state,'disconnected');
    assert.equal(sql(`select count(*) from social_account_identity_events where identity_id='${id}';`),'2');
  });
  await check('errors roll back both creation and ending, plus complete outer transaction',()=>{
    const before=digest();
    sql(`insert into sessions(id,discord_user_id) values('${uuid(88)}','8');`);
    sql("create function identity_test_fail() returns trigger language plpgsql as $$begin raise exception 'INJECTED_EVENT_FAILURE';end;$$;create trigger identity_test_failure before insert on social_account_identity_events for each row execute function identity_test_fail();");
    failure(record(88,'rollback-subject'),/INJECTED_EVENT_FAILURE/u);
    failure(end(1,own(1)[0].identityId),/INJECTED_EVENT_FAILURE/u);
    assert.equal(digest(),before);
    sql('drop trigger identity_test_failure on social_account_identity_events;drop function identity_test_fail();');
    sql(`begin;${record(88,'outer-rollback')}rollback;`);assert.equal(digest(),before);
    failure(`begin isolation level repeatable read;${record(88,'isolation')}commit;`,/SOCIAL_IDENTITY_REQUEST_INVALID/u);
    assert.equal(digest(),before);
    const after=sql("select md5((select jsonb_agg(to_jsonb(u) order by owner_discord_user_id)::text from social_account_linking_unlocks u)||(select jsonb_agg(to_jsonb(e) order by id)::text from notification_events e));");
    assert.equal(after,sourceBefore);
  });
  console.log(`${checks} isolated identity PostgreSQL check groups passed; no existing database contacted.`);
} catch(error) { primaryError=error;throw error; }
finally {
  try {
    if(started)run('pg_ctl',['-D',data,'-m','fast','-w','stop']);
    const resolved=realpathSync(directory);
    if(path.dirname(resolved)!==tempRoot||!path.basename(resolved).startsWith('cc-social-local-'))throw Error('Unsafe cleanup path');
    rmSync(resolved,{recursive:true,force:true,maxRetries:5,retryDelay:200});
  } catch(error) { if(!primaryError)throw error;console.error('Local cleanup requires attention: '+directory); }
}
