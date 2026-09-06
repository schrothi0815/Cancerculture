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
  const management=readFileSync(new URL('../../supabase/migrations/20260905000300_social_account_management.sql',import.meta.url),'utf8');
  console.log('Management migration SHA256 '+createHash('sha256').update(management).digest('hex'));
  sql(`begin;${management}commit;`);
  const visibility=owner=>value(`set role service_role;select get_own_social_account_visibility('${uuid(owner)}');`);
  const setVisibility=(owner,scope,val,version,request=uuid(nextRequest++))=>`set role service_role;select set_own_social_account_visibility('${uuid(owner)}',${q(scope)},${val},${version},'${request}');`;
  const snapshot=()=>sql("select md5((select jsonb_agg(to_jsonb(u) order by discord_user_id)::text from user_logs u)||(select coalesce(jsonb_agg(to_jsonb(e) order by request_id)::text,'') from social_account_visibility_events e));");
  await check('exact signatures, postgres ownership, paths, RLS and no application table or writer access',()=>{
    const names=['protect_social_account_visibility','get_own_social_account_visibility','set_own_social_account_visibility'];
    for(const name of names){
      assert.equal(sql(`select count(*) from pg_proc where pronamespace='public'::regnamespace and proname='${name}';`),'1');
      assert.equal(sql(`select proowner='postgres'::regrole and proconfig=array['search_path=public, pg_temp'] and prosecdef=${name!=='protect_social_account_visibility'} from pg_proc where pronamespace='public'::regnamespace and proname='${name}';`),'t');
    }
    assert.equal(sql("select relrowsecurity and relowner='postgres'::regrole from pg_class where oid='social_account_visibility_events'::regclass;"),'t');
    assert.equal(sql("select count(*) from pg_policy where polrelid='social_account_visibility_events'::regclass;"),'0');
    for(const role of ['anon','authenticated','service_role','discord_bot']){
      assert.equal(sql(`select has_table_privilege('${role}','social_account_visibility_events','SELECT,INSERT,UPDATE,DELETE,TRUNCATE');`),'f');
      for(const signature of ['get_own_social_account_visibility(uuid)','set_own_social_account_visibility(uuid,text,boolean,integer,uuid)'])assert.equal(sql(`select has_function_privilege('${role}','${signature}','EXECUTE');`),role==='service_role'?'t':'f');
      assert.equal(sql(`select has_function_privilege('${role}','record_social_account_identity(uuid,uuid,text,text,text,text,uuid,uuid,integer)','EXECUTE');`),'f');
    }
    // Match the real service role's RLS bypass in this disposable cluster.
    sql('alter role service_role bypassrls; grant usage on schema public to service_role; grant select,insert,update on user_logs to service_role;');
    failure("set role service_role;update user_logs set show_socials=true where discord_user_id='1';",/SOCIAL_VISIBILITY_NOT_AVAILABLE/u);
    failure("set role service_role;update user_logs set social_visibility_version=99 where discord_user_id='1';",/SOCIAL_VISIBILITY_NOT_AVAILABLE/u);
    failure("set role service_role;insert into user_logs(discord_user_id,current_discord_username,show_socials) values('500','Fixture',true);",/SOCIAL_VISIBILITY_NOT_AVAILABLE/u);
  });
  await check('unknown, revoked, banned, anonymous, malformed and foreign requests cannot mutate',()=>{
    failure(setVisibility(999,'profile',false,0),/ACCOUNT_SESSION_INVALID/u);
    failure("set role anon;select public.get_own_social_account_visibility('"+uuid(1)+"');",/permission denied/u);
    sql(`update sessions set revoked_at=now() where id='${uuid(8)}';`);
    failure(setVisibility(8,'profile',false,0),/ACCOUNT_SESSION_INVALID/u);
    sql("update user_logs set is_banned=true where discord_user_id='7';");
    failure(setVisibility(7,'profile',false,0),/ACCOUNT_SESSION_INVALID/u);
    for(const scope of ['unknown',null])failure(setVisibility(1,scope,false,0),/SOCIAL_VISIBILITY_REQUEST_INVALID/u);
    failure(setVisibility(1,'profile',null,0),/SOCIAL_VISIBILITY_REQUEST_INVALID/u);
    failure(setVisibility(1,'profile',false,-1),/SOCIAL_VISIBILITY_REQUEST_INVALID/u);
    assert.equal(visibility(1).version,0);
  });
  await check('activation needs both unlock and active canonical identity; withdrawal needs neither',()=>{
    failure(setVisibility(1,'profile',true,0),/SOCIAL_VISIBILITY_NOT_AVAILABLE/u);
    failure(setVisibility(9,'profile',true,0),/SOCIAL_VISIBILITY_NOT_AVAILABLE/u);
    value(setVisibility(9,'profile',false,0)); assert.equal(visibility(9).version,1);
    value(record(1,'one')); value(record(2,'two','x','two')); value(record(3,'three','x','three')); value(record(4,'four','x','four')); value(record(5,'five','x','five')); value(record(6,'six','x','six'));
    // The missing-unlock fixture is tested within a rollback-only local transaction.
    failure(`begin;alter table social_account_linking_unlocks disable trigger user;delete from social_account_linking_unlocks where owner_discord_user_id='6';${setVisibility(6,'profile',true,0)}commit;`,/SOCIAL_VISIBILITY_NOT_AVAILABLE/u);
    assert.equal(visibility(6).canEnable,true);
  });
  await check('independent opt-ins, exact replay, CAS and ABA protection, public withdrawal',()=>{
    const request=uuid(nextRequest++),enable=setVisibility(1,'profile',true,0,request);
    assert.deepEqual(value(enable),{version:1}); assert.deepEqual(value(enable),{version:1});
    assert.deepEqual(visibility(1),{profile:true,submissions:false,version:1,canEnable:true});
    assert.equal(publicLinks(1).length,1);assert.equal(publicLinks(1,'submission').length,0);
    failure(setVisibility(1,'submissions',true,1,request),/SOCIAL_VISIBILITY_REQUEST_INVALID/u);
    failure(setVisibility(2,'profile',true,0,request),/SOCIAL_VISIBILITY_REQUEST_INVALID/u);
    value(setVisibility(1,'submissions',true,1)); value(setVisibility(1,'profile',false,2));
    assert.equal(publicLinks(1).length,0);assert.equal(publicLinks(1,'submission').length,1);
    assert.deepEqual(value(enable),{version:1});assert.equal(visibility(1).profile,false);
    failure(setVisibility(1,'profile',true,0),/SOCIAL_VISIBILITY_NOT_AVAILABLE/u);
    value(setVisibility(1,'submissions',false,3));assert.equal(publicLinks(1,'submission').length,0);
  });
  await check('disconnect latest generation, foreign ID, replay after reconnect and withdrawal without active link',()=>{
    const id=own(1)[0].identityId,request=uuid(nextRequest++),disconnect=end(1,id,1,request);
    failure(end(2,id),/SOCIAL_IDENTITY_NOT_AVAILABLE/u);
    value(setVisibility(1,'profile',true,4));value(disconnect);
    assert.equal(publicLinks(1).length,0);assert.equal(visibility(1).canEnable,false);
    value(setVisibility(1,'profile',false,5));
    const fresh=value(record(1,'one-again','x','fresh',id,2));
    value(disconnect);assert.equal(own(1)[0].identityId,fresh.identityId);assert.equal(own(1)[0].state,'active');
    failure(end(1,id),/SOCIAL_IDENTITY_NOT_AVAILABLE/u);
    sql(`select end_social_account_identity('1','${fresh.identityId}',1,'${uuid(nextRequest++)}','revoked');`);
    assert.equal(own(1)[0].state,'revoked');assert.equal(publicLinks(1).length,0);
  });
  await check('two sessions concurrent writes have one winner; duplicate request replays once',async()=>{
    sql(`insert into sessions(id,discord_user_id) values('${uuid(22)}','2');`);
    const first=setVisibility(2,'profile',true,0),release=await holdTransaction(first);
    const second=concurrent(setVisibility(22,'submissions',true,0),'cc_management_cas').then(()=>({ok:true}),error=>({error}));
    try{await waitForDatabaseState("select exists(select 1 from pg_stat_activity where application_name='cc_management_cas' and wait_event_type='Lock');");}finally{await release();}
    assert.match((await second).error.message,/SOCIAL_VISIBILITY_NOT_AVAILABLE/u);
    const same=setVisibility(2,'profile',false,1),release2=await holdTransaction(same);
    const replay=concurrent(same,'cc_management_replay');
    try{await waitForDatabaseState("select exists(select 1 from pg_stat_activity where application_name='cc_management_replay' and wait_event_type='Lock');");}finally{await release2();}
    assert.deepEqual(JSON.parse(await replay),{version:2});assert.equal(visibility(2).version,2);
  });
  await check('disconnect versus enabling waits then rejects absent active identity',async()=>{
    const release=await holdTransaction(end(3,own(3)[0].identityId));
    const pending=concurrent(setVisibility(3,'profile',true,0),'cc_management_disconnect').then(()=>({ok:true}),error=>({error}));
    try{await waitForDatabaseState("select exists(select 1 from pg_stat_activity where application_name='cc_management_disconnect' and wait_event_type='Lock');");}finally{await release();}
    assert.match((await pending).error.message,/SOCIAL_VISIBILITY_NOT_AVAILABLE/u);assert.equal(visibility(3).profile,false);
  });
  await check('visibility versus disconnect and reconnect serialize without reactivating old identity',async()=>{
    const id=own(4)[0].identityId;
    const release=await holdTransaction(setVisibility(4,'profile',true,0));
    const pending=concurrent(end(4,id),'cc_management_enable');
    try{await waitForDatabaseState("select exists(select 1 from pg_stat_activity where application_name='cc_management_enable' and wait_event_type='Lock');");}finally{await release();}
    await pending;assert.equal(publicLinks(4).length,0);
    const old=own(4)[0]; const release2=await holdTransaction(record(4,'new-four','x','newfour',old.identityId,2));
    const off=concurrent(setVisibility(4,'profile',false,1),'cc_management_generation');
    try{await waitForDatabaseState("select exists(select 1 from pg_stat_activity where application_name='cc_management_generation' and wait_event_type='Lock');");}finally{await release2();}
    await off;assert.equal(publicLinks(4).length,0);assert.equal(own(4)[0].state,'active');
  });
  await check('ban and visibility share user-before-session order, ban wins without a deadlock',async()=>{
    const release=await holdTransaction("update user_logs set is_banned=true where discord_user_id='5';");
    const pending=concurrent(setVisibility(5,'profile',true,0),'cc_management_ban').then(()=>({ok:true}),error=>({error}));
    try{await waitForDatabaseState("select exists(select 1 from pg_stat_activity where application_name='cc_management_ban' and wait_event_type='Lock');");}finally{await release();}
    assert.match((await pending).error.message,/ACCOUNT_SESSION_INVALID/u);
    assert.equal(sql("select is_banned and not show_socials from user_logs where discord_user_id='5';"),'t');
  });
  await check('injected event error and outer rollback restore preferences, version and history',()=>{
    const before=snapshot();
    sql("create function management_test_fail() returns trigger language plpgsql as $$begin raise exception 'INJECTED_EVENT_FAILURE';end;$$;create trigger management_test_failure before insert on social_account_visibility_events for each row execute function management_test_fail();");
    failure(setVisibility(6,'profile',true,0),/INJECTED_EVENT_FAILURE/u);assert.equal(snapshot(),before);
    sql('drop trigger management_test_failure on social_account_visibility_events;drop function management_test_fail();');
    sql(`begin;${setVisibility(6,'profile',true,0)}rollback;`);assert.equal(snapshot(),before);
    failure('update social_account_visibility_events set value=false;',/SOCIAL_IDENTITY_HISTORY_IMMUTABLE/u);
    failure('delete from social_account_visibility_events;',/SOCIAL_IDENTITY_HISTORY_IMMUTABLE/u);
    failure('truncate social_account_visibility_events;',/SOCIAL_IDENTITY_HISTORY_IMMUTABLE/u);
    failure(`begin isolation level repeatable read;${setVisibility(6,'profile',true,0)}commit;`,/SOCIAL_IDENTITY_REQUEST_INVALID/u);
  });
  console.log(`${checks} isolated management PostgreSQL check groups passed; no existing database contacted.`);
} catch(error) { primaryError=error;throw error; }
finally {
  try {
    if(started)run('pg_ctl',['-D',data,'-m','fast','-w','stop']);
    const resolved=realpathSync(directory);
    if(path.dirname(resolved)!==tempRoot||!path.basename(resolved).startsWith('cc-social-local-'))throw Error('Unsafe cleanup path');
    rmSync(resolved,{recursive:true,force:true,maxRetries:5,retryDelay:200});
  } catch(error) { if(!primaryError)throw error;console.error('Local cleanup requires attention: '+directory); }
}
