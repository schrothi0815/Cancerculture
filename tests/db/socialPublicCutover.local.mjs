// Explicit opt-in only; never consumes a configured database URL or existing cluster.
// Requires a schema-only export; no domain or authorization functions are replaced.
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
let checks=0, started=false, primaryError;
const check=async(name,fn)=>{await fn();checks++;console.log('PASS '+name);};
const uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const q=s=>"'"+String(s).replaceAll("'","''")+"'";
try {
 run('initdb',['-D',data,'-U','postgres','-A','trust','--encoding=UTF8','--no-locale']);started=true;
 run('pg_ctl',['-D',data,'-l',path.join(directory,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port}`,'-w','start']);
 const schemaPath=process.argv.find(a=>a.startsWith('--schema='))?.slice(9);
 const rolesPath=process.argv.find(a=>a.startsWith('--roles='))?.slice(8);
 assert.ok(schemaPath&&rolesPath,'Explicit schema-only and roles exports required');
 const schema=readFileSync(schemaPath,'utf8');
 const roles=JSON.parse(readFileSync(rolesPath,'utf8')).filter(r=>schema.includes(r));
 sql(roles.map(r=>{assert.match(r,/^[a-z_]+$/u);return 'create role '+r+' nologin;';}).join('\n')+'drop schema public cascade;create schema extensions;create extension pgcrypto with schema extensions;');
 run('psql',args,schema);sql('alter role service_role bypassrls;');
 console.log('Isolated schema-only SHA256 '+createHash('sha256').update(schema).digest('hex'));
 for(const name of ['20260905000100_social_account_linking_unlock_foundation.sql','20260905000200_social_account_identity_foundation.sql','20260905000300_social_account_management.sql'])sql('begin;'+readFileSync(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8')+'commit;');
 const migration=readFileSync(new URL('../../supabase/migrations/20260906000100_social_account_public_cutover.sql',import.meta.url),'utf8');
 console.log('Cutover SHA256 '+createHash('sha256').update(migration).digest('hex'));
 const oldDefinition=sql("select pg_get_functiondef('commit_submission_upload(uuid,uuid,integer,integer)'::regprocedure);");
 const resetDefinition=sql("select pg_get_functiondef('reset_cycle(bigint,text,text)'::regprocedure);");
 await check('migration rollback restores upload function and grants',()=>{
  const before=sql("select relacl::text from pg_class where oid='user_social_links'::regclass;");
  sql('begin;'+migration+'rollback;');
  assert.equal(sql("select pg_get_functiondef('commit_submission_upload(uuid,uuid,integer,integer)'::regprocedure);"),oldDefinition);
  assert.equal(sql("select relacl::text from pg_class where oid='user_social_links'::regclass;"),before);
 });
 sql('begin;'+migration+'commit;');
 await check('exact upload signature, ownership, definer, path, ACL and legacy write retirement',()=>{
  assert.equal(sql("select count(*) from pg_proc where pronamespace='public'::regnamespace and proname='commit_submission_upload' and proowner='postgres'::regrole and prosecdef and proconfig=array['search_path=public, pg_temp'];"),'1');
  for(const role of ['anon','authenticated','discord_bot','service_role']){
   assert.equal(sql(`select has_function_privilege('${role}','commit_submission_upload(uuid,uuid,integer,integer)','EXECUTE');`),role==='service_role'?'t':'f');
   for(const table of ['user_social_links','submission_social_links','social_verification_logs']){
    assert.equal(sql(`select has_table_privilege('${role}','${table}','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER');`),'f');
    failure(`set role ${role};delete from public.${table};`,/permission denied/);
   }
  }
  assert.equal(sql("select pg_get_functiondef('reset_cycle(bigint,text,text)'::regprocedure);"),resetDefinition);
  failure('begin;'+migration+'commit;',/SOCIAL_PUBLIC_CUTOVER_BASELINE_MISMATCH/);
 });
 sql("insert into rules_meta(id,current_version) values(1,1);insert into voting_cycles(id,status,submissions_per_user,upload_success_cooldown_seconds) values(100,'submission_open',2,30);");
 for(let owner=1;owner<=4;owner++)sql(`insert into user_logs(discord_user_id,current_discord_username,accepted_rules_version,public_profile_id) values('${owner}','Fixture',1,'${uuid(owner+20)}');insert into sessions(id,discord_user_id) values('${uuid(owner)}','${owner}');insert into discord_member_state(discord_user_id,current_discord_username,discord_joined_at,is_in_discord) values('${owner}','Fixture',now()-interval '1 day',true);`);
 sql("insert into social_account_qualifying_cycles(owner_discord_user_id,cycle_id,source_submission_id,source_result_id,finalized_at) select '1',n,n,n,now() from generate_series(1,5)n;with e as(insert into notification_events(producer_key,event_type,category_key,audience_type,owner_discord_user_id,deep_link) values('fixture-unlock','social_account_linking_unlocked','social_account_linking','account','1','/settings/profile') returning id) insert into social_account_linking_unlocks select '1',5,now(),'historical_backfill',id from e;");
 const record=(n,previous=null)=>value(`select record_social_account_identity('${uuid(1)}','${uuid(n)}','x','private-subject-${n}','fixture${n}','Fixture','${uuid(n+100)}',${previous?q(previous):'null'},${previous?2:0});`);
 const publicLinks=surface=>value(`set role service_role;select get_public_social_account_identities('${uuid(21)}','${surface}');`);
 const first=record(200);
 sql(`set role service_role;select set_own_social_account_visibility('${uuid(1)}','submissions',true,0,'${uuid(400)}');`);
 // Local legacy evidence is retained solely to prove upload ignores manual verification.
 sql("insert into user_social_links(discord_user_id,platform,handle,profile_url,is_verified) values('1','x','legacy','https://x.com/legacy',true);");
 function operation(owner,n){sql(`insert into submission_upload_operations(id,discord_user_id,cycle_id,idempotency_key,request_fingerprint,content_sha256,storage_key,media_type,media_bytes,status,wallet_source,wallet_address,payout_choice) values('${uuid(n)}','${owner}',100,'${uuid(n+500)}',repeat('a',64),repeat('b',64),'100/${uuid(n)}.webp','image/webp',100,'r2_uploaded','manual','So11111111111111111111111111111111111111112','keep');`);return `set role service_role;select commit_submission_upload('${uuid(n)}','${uuid(owner)}',600,400);`;}
 let submitted;
 await check('real upload and replay preserve wallet/quota/receipt while writing zero legacy snapshots',()=>{
  const call=operation(1,500);submitted=value(call);assert.equal(submitted.outcome,'completed');assert.equal(submitted.socialSnapshotCount,0);assert.equal(submitted.used,1);assert.equal(submitted.limit,2);
  assert.equal(value(call).outcome,'already_completed');assert.equal(sql('select count(*) from submission_social_links;'),'0');
  assert.equal(sql(`select wallet_address from submission_private_data where submission_id=${submitted.submissionId};`),'So11111111111111111111111111111111111111112');
 });
 await check('historical records remain unchanged while current public reads withdraw and replace identity',()=>{
  sql(`insert into submission_social_links(submission_id,discord_user_id,platform,display_label,profile_url,is_verified_snapshot) values(${submitted.submissionId},'1','x','Legacy snapshot','https://x.com/legacy',true);`);
  const before=sql("select md5(to_jsonb(s)::text) from submission_social_links s;");
  assert.equal(publicLinks('profile').length,0);assert.equal(publicLinks('submission').length,1);
  sql(`set role service_role;select disconnect_own_social_account_identity('${uuid(1)}','${first.identityId}',1,'${uuid(401)}');`);
  assert.deepEqual(publicLinks('submission'),[]);const second=record(201,first.identityId);
  assert.equal(publicLinks('submission')[0].url,'https://x.com/fixture201');
  sql(`select end_social_account_identity('1','${second.identityId}',1,'${uuid(402)}','revoked');`);
  assert.deepEqual(publicLinks('submission'),[]);assert.equal(sql("select md5(to_jsonb(s)::text) from submission_social_links s;"),before);
 });
 await check('same-operation concurrency serializes and commits one submission',async()=>{
  const call=operation(2,501);const release=await holdTransaction(`select id from submission_upload_operations where id='${uuid(501)}' for update;`);
  const a=concurrent(call,'cutover_upload_a');const b=concurrent(call,'cutover_upload_b');
  await waitForDatabaseState("select count(*)=2 from pg_stat_activity where application_name in ('cutover_upload_a','cutover_upload_b') and wait_event_type='Lock';");await release();
  assert.deepEqual((await Promise.all([a,b])).map(s=>JSON.parse(s).outcome).sort(),['already_completed','completed']);
  assert.equal(sql("select count(*) from submissions where discord_user_id='2';"),'1');
 });
 await check('upload does not wait for or read the old snapshot source',async()=>{
  const call=operation(3,502);const release=await holdTransaction("lock table user_social_links in access exclusive mode;");
  try{assert.equal(JSON.parse(await concurrent(call)).outcome,'completed');}finally{await release();}
  assert.equal(sql('select count(*) from submission_social_links;'),'1');
 });
 await check('injected upload-log error rolls back submission, private wallet and operation before retry',()=>{
  const call=operation(4,503);
  const snapshot=()=>sql("select md5((select coalesce(jsonb_agg(to_jsonb(s) order by id)::text,'') from submissions s)||(select coalesce(jsonb_agg(to_jsonb(p) order by submission_id)::text,'') from submission_private_data p)||(select coalesce(jsonb_agg(to_jsonb(o) order by id)::text,'') from submission_upload_operations o));");
  const before=snapshot();sql("create function cutover_test_fail() returns trigger language plpgsql as $$begin raise exception 'INJECTED_UPLOAD_FAILURE';end;$$;create trigger cutover_test_error before insert on upload_logs for each row execute function cutover_test_fail();");
  failure(call,/INJECTED_UPLOAD_FAILURE/);assert.equal(snapshot(),before);sql('drop trigger cutover_test_error on upload_logs;drop function cutover_test_fail();');assert.equal(value(call).outcome,'completed');
 });
 console.log(checks+' isolated PostgreSQL groups passed; no existing database contacted.');
} catch(error) { primaryError=error;throw error; }

finally {
  try {
    if(started)run('pg_ctl',['-D',data,'-m','fast','-w','stop']);
    const resolved=realpathSync(directory);
    if(path.dirname(resolved)!==tempRoot||!path.basename(resolved).startsWith('cc-social-local-'))throw Error('Unsafe cleanup path');
    rmSync(resolved,{recursive:true,force:true,maxRetries:5,retryDelay:200});
  } catch(error) { if(!primaryError)throw error;console.error('Local cleanup requires attention: '+directory); }
}
