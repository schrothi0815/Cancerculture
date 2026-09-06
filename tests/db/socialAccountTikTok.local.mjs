// Explicit opt-in only. Creates a disposable loopback PostgreSQL cluster and
// never consumes a configured database URL or an existing database.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createServer} from 'node:net';
import {mkdtempSync,readFileSync,realpathSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

if(process.argv[2]!=='--isolated-local')throw Error('Use --isolated-local to create a disposable local test cluster.');
const bin=process.env.POSTGRES_BIN??(process.platform==='win32'?'C:/Program Files/PostgreSQL/18/bin':'');
const binary=name=>bin?path.join(bin,`${name}${process.platform==='win32'?'.exe':''}`):name;
const root=realpathSync(os.tmpdir()),directory=mkdtempSync(path.join(root,'cc-tiktok-local-')),data=path.join(directory,'data');
const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('PG')&&!/DATABASE_URL|SUPABASE/u.test(key)));
const port=await new Promise((resolve,reject)=>{const server=createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const value=server.address().port;server.close(()=>resolve(value));});});
Object.assign(env,{PGHOST:'127.0.0.1',PGPORT:String(port),PGUSER:'postgres',PGDATABASE:'postgres',PGCONNECT_TIMEOUT:'5'});
const args=['-X','--no-password','-v','ON_ERROR_STOP=1','-qAt','-f','-'];
function run(name,parameters,input){const result=spawnSync(binary(name),parameters,{env,input,encoding:'utf8',windowsHide:true,timeout:30000,...(name==='pg_ctl'?{stdio:'ignore'}:{})});if(result.error||result.status!==0)throw Error(`${name} failed: ${result.error?.code??result.stderr}`);return result.stdout?.trim()??'';}
function sql(query){return run('psql',args,`set statement_timeout='6s';set lock_timeout='3s';\n${query}`);}
function value(query){return JSON.parse(sql(query));}
function failure(query,pattern){const result=spawnSync(binary('psql'),args,{env,input:query,encoding:'utf8',windowsHide:true,timeout:10000});assert.notEqual(result.status,0);assert.match(result.stderr,pattern);}
function concurrent(query){return new Promise((resolve,reject)=>{const child=spawn(binary('psql'),args,{env,windowsHide:true});let out='',err='';child.stdout.on('data',chunk=>out+=chunk);child.stderr.on('data',chunk=>err+=chunk);child.on('error',reject);child.on('close',code=>code===0?resolve(out.trim()):reject(Error(err)));child.stdin.end(`set statement_timeout='6s';set lock_timeout='3s';${query}`);});}
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const q=text=>`'${String(text).replaceAll("'","''")}'`;
const digest=n=>createHash('sha256').update(String(n)).digest('hex');
const call=(owner,body)=>`set role service_role;${body.replaceAll('$session$',uuid(owner))}`;
const start=(owner,n)=>value(call(owner,`select start_tiktok_social_account_link('$session$','${uuid(n)}','${digest(n)}');`));
const claim=(owner,n)=>value(call(owner,`select claim_tiktok_social_account_link('$session$','${digest(n)}');`));
const complete=(owner,n,subject,locator)=>value(call(owner,`select complete_tiktok_social_account_link('$session$','${uuid(n)}',2,${q(subject)},${q(locator)},${q('@'+locator)});`));
const finish=(owner,n,outcome,reason)=>value(call(owner,`select finish_tiktok_social_account_link('$session$','${uuid(n)}',2,${q(outcome)},${q(reason)});`));
let checks=0,started=false,primaryError;
const check=async(name,fn)=>{await fn();checks++;console.log(`PASS ${name}`);};
try{
  run('initdb',['-D',data,'-U','postgres','-A','trust','--encoding=UTF8','--no-locale']);started=true;
  run('pg_ctl',['-D',data,'-l',path.join(directory,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port}`,'-w','start']);
  const schemaPath=process.argv.find(arg=>arg.startsWith('--schema='))?.slice(9);
  if(schemaPath){
    const schema=readFileSync(schemaPath,'utf8');
    const rolesPath=process.argv.find(arg=>arg.startsWith('--roles='))?.slice(8);
    const roles=JSON.parse(readFileSync(rolesPath,'utf8')).filter(role=>schema.includes(role));
    sql(roles.map(role=>{assert.match(role,/^[a-z_]+$/u);return `create role ${role} nologin;`;}).join('\n')+'drop schema public cascade;create schema extensions;create extension pgcrypto with schema extensions;');
    run('psql',args,schema);console.log('Actual schema-only restore SHA256 '+createHash('sha256').update(schema).digest('hex'));
  }else{
    sql(readFileSync(new URL('socialAccountLinking.local.fixture.sql',import.meta.url),'utf8'));
    sql("alter table discord_member_state add column current_discord_username text, add column is_in_discord boolean default true;alter table user_logs add column current_discord_username text not null default 'Fixture', add column public_profile_id uuid default gen_random_uuid(), add column show_socials boolean not null default false, add column show_socials_on_submissions boolean not null default false;");
  }
  const migrations=['20260905000100_social_account_linking_unlock_foundation.sql','20260905000200_social_account_identity_foundation.sql','20260905000300_social_account_management.sql'];
  if(schemaPath)migrations.push('20260906000100_social_account_public_cutover.sql');
  for(const name of migrations)sql(`begin;${readFileSync(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8')}commit;`);
  const migration=readFileSync(new URL('../../supabase/migrations/20260906000200_social_account_tiktok_oauth.sql',import.meta.url),'utf8');
  console.log('Isolated TikTok migration SHA256 '+createHash('sha256').update(migration).digest('hex'));
  failure(`begin;create function public.start_tiktok_social_account_link() returns void language plpgsql as $fn$begin return;end$fn$;${migration}rollback;`,/SOCIAL_TIKTOK_BASELINE_MISMATCH/u);
  sql(`begin;${migration}commit;`);

  for(let owner=1;owner<=6;owner++){
    sql(`insert into user_logs(discord_user_id,current_discord_username,public_profile_id) values('${owner}','Fixture','${uuid(owner+100)}');insert into sessions(id,discord_user_id) values('${uuid(owner)}','${owner}');`);
    if(owner===6)continue;
    sql(`insert into social_account_qualifying_cycles(owner_discord_user_id,cycle_id,source_submission_id,source_result_id,finalized_at) select '${owner}',n,n,n,now() from generate_series(1,5)n;
      with e as (insert into notification_events(producer_key,event_type,category_key,audience_type,owner_discord_user_id,deep_link) values('tiktok-unlock-${owner}','social_account_linking_unlocked','social_account_linking','account','${owner}','/settings/profile') returning id)
      insert into social_account_linking_unlocks select '${owner}',5,now(),'historical_backfill',id from e;`);
  }

  await check('exact owners, RLS, no policies, closed tables and narrow service functions',()=>{
    assert.equal(sql("select count(*) from pg_class where relname in ('social_account_oauth_attempts','social_account_oauth_attempt_events') and relowner='postgres'::regrole and relrowsecurity;"),'2');
    assert.equal(sql("select count(*) from pg_policy where polrelid in ('social_account_oauth_attempts'::regclass,'social_account_oauth_attempt_events'::regclass);"),'0');
    for(const role of ['anon','authenticated','service_role','discord_bot'])for(const table of ['social_account_oauth_attempts','social_account_oauth_attempt_events'])for(const operation of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE'])assert.equal(sql(`select has_table_privilege('${role}','${table}','${operation}');`),'f');
    const functions=value("select json_agg(json_build_object('signature',oid::regprocedure::text,'owner',proowner='postgres'::regrole,'path',proconfig,'definer',prosecdef) order by oid::regprocedure::text) from pg_proc where pronamespace='public'::regnamespace and proname like '%tiktok_social_account_link' or pronamespace='public'::regnamespace and proname='protect_social_account_oauth_attempt_history';");
    assert.equal(functions.length,5);for(const fn of functions){assert.equal(fn.owner,true);assert.deepEqual(fn.path,['search_path=public, pg_temp']);assert.equal(fn.definer,fn.signature!=='protect_social_account_oauth_attempt_history()');}
    for(const role of ['anon','authenticated','discord_bot'])for(const fn of functions)assert.equal(sql(`select has_function_privilege('${role}',${q(fn.signature)},'EXECUTE');`),'f');
    for(const fn of functions)assert.equal(sql(`select has_function_privilege('service_role',${q(fn.signature)},'EXECUTE');`),fn.signature==='protect_social_account_oauth_attempt_history()'?'f':'t');
    assert.equal(sql("select has_function_privilege('service_role','record_social_account_identity(uuid,uuid,text,text,text,text,uuid,uuid,integer)','EXECUTE');"),'f');
  });

  await check('session, permanent unlock, active identity and malformed input fail before a new attempt',()=>{
    failure(call(6,`select start_tiktok_social_account_link('$session$','${uuid(200)}','${digest(200)}');`),/SOCIAL_TIKTOK_NOT_AVAILABLE/u);
    failure(call(1,`select start_tiktok_social_account_link('$session$','${uuid(200)}','bad');`),/SOCIAL_TIKTOK_REQUEST_INVALID/u);
    failure(call(99,`select start_tiktok_social_account_link('$session$','${uuid(200)}','${digest(200)}');`),/ACCOUNT_SESSION_INVALID/u);
    const existing=value(`select record_social_account_identity('${uuid(5)}','${uuid(201)}','tiktok','active-subject','active','@active','${uuid(202)}',null,0);`);
    failure(call(5,`select start_tiktok_social_account_link('$session$','${uuid(203)}','${digest(203)}');`),/SOCIAL_TIKTOK_NOT_AVAILABLE/u);
    assert.ok(existing.identityId);assert.equal(sql('select count(*) from social_account_oauth_attempts;'),'0');
  });

  await check('start stores only a digest and captured generation; pending replacement is explicit',()=>{
    const first=start(1,210);assert.equal(first.attemptId,uuid(210));
    assert.deepEqual(value(`select json_build_object('owner',owner_discord_user_id,'session',initiating_session_id,'provider',provider,'digest',state_digest,'status',status,'version',version,'expected',expected_identity_version) from social_account_oauth_attempts where id='${uuid(210)}';`),{owner:'1',session:uuid(1),provider:'tiktok',digest:digest(210),status:'pending',version:1,expected:0});
    start(1,211);
    assert.deepEqual(value(`select json_agg(json_build_object('id',id,'status',status,'reason',status_reason,'version',version) order by id) from social_account_oauth_attempts where owner_discord_user_id='1';`),[
      {id:uuid(210),status:'cancelled',reason:'superseded',version:2},{id:uuid(211),status:'pending',reason:null,version:1}]);
  });

  await check('claim is one-time, bound to the initiating session and expires by database time',()=>{
    failure(call(2,`select claim_tiktok_social_account_link('$session$','${digest(211)}');`),/SOCIAL_TIKTOK_NOT_AVAILABLE/u);
    const claimed=claim(1,211);assert.deepEqual(claimed,{outcome:'claimed',attemptId:uuid(211),version:2});
    failure(call(1,`select claim_tiktok_social_account_link('$session$','${digest(211)}');`),/SOCIAL_TIKTOK_NOT_AVAILABLE/u);
    failure(call(1,`select start_tiktok_social_account_link('$session$','${uuid(212)}','${digest(212)}');`),/SOCIAL_TIKTOK_ATTEMPT_IN_PROGRESS/u);
    sql(`insert into social_account_oauth_attempts(id,owner_discord_user_id,initiating_session_id,provider,state_digest,expected_identity_version,status,version,created_at,expires_at) values('${uuid(220)}','2','${uuid(2)}','tiktok','${digest(220)}',0,'pending',1,now()-interval '11 minutes',now()-interval '1 minute');insert into social_account_oauth_attempt_events values('${uuid(220)}',1,'pending','started',now()-interval '11 minutes');`);
    assert.deepEqual(value(call(2,`select claim_tiktok_social_account_link('$session$','${digest(220)}');`)),{outcome:'expired'});
    assert.equal(sql(`select status||':'||version from social_account_oauth_attempts where id='${uuid(220)}';`),'expired:2');
  });

  let firstIdentity;
  await check('validated completion is atomic, private by default and independent from visibility',()=>{
    firstIdentity=complete(1,211,'subject-one','creator.one').identityId;
    assert.equal(complete(1,211,'subject-one','creator.one').identityId,firstIdentity);
    assert.equal(sql(`select status||':'||version from social_account_oauth_attempts where id='${uuid(211)}';`),'verified:3');
    assert.equal(sql(`select provider||':'||provider_account_id||':'||public_locator||':'||state from social_account_identities where id='${firstIdentity}';`),'tiktok:subject-one:creator.one:active');
    assert.equal(sql(`select count(*) from social_account_identity_events where identity_id='${firstIdentity}' and event_type='verified';`),'1');
    assert.deepEqual(value(call(1,`select get_public_social_account_identities('${uuid(101)}','profile');`)),[]);
    assert.equal(sql("select count(*) from social_account_oauth_attempts where to_jsonb(social_account_oauth_attempts)::text ~* 'access.?token|refresh.?token|provider.?response';"),'0');
  });

  await check('visibility, disconnect and new-proof reconnect expose only the current generation',()=>{
    value(call(1,`select set_own_social_account_visibility('$session$','profile',true,0,'${uuid(230)}');`));
    assert.deepEqual(value(call(1,`select get_public_social_account_identities('${uuid(101)}','profile');`)),[{provider:'tiktok',displayLabel:'@creator.one',url:'https://www.tiktok.com/@creator.one'}]);
    value(call(1,`select disconnect_own_social_account_identity('$session$','${firstIdentity}',1,'${uuid(231)}');`));
    assert.deepEqual(value(call(1,`select get_public_social_account_identities('${uuid(101)}','profile');`)),[]);
    start(1,232);claim(1,232);const second=complete(1,232,'subject-two','creator.two').identityId;
    assert.notEqual(second,firstIdentity);assert.equal(sql(`select generation from social_account_identities where id='${second}';`),'2');
    assert.deepEqual(value(call(1,`select get_public_social_account_identities('${uuid(101)}','profile');`)),[{provider:'tiktok',displayLabel:'@creator.two',url:'https://www.tiktok.com/@creator.two'}]);
  });

  await check('duplicate provider subject rolls back identity and attempt completion, then records a neutral terminal failure',()=>{
    start(2,240);claim(2,240);const before=sql("select md5(coalesce(string_agg(md5(to_jsonb(i)::text),'' order by id),'')||coalesce((select string_agg(md5(to_jsonb(e)::text),'' order by request_id) from social_account_identity_events e),'')) from social_account_identities i;");
    failure(call(2,`select complete_tiktok_social_account_link('$session$','${uuid(240)}',2,'subject-two','other','@other');`),/SOCIAL_IDENTITY_NOT_AVAILABLE/u);
    assert.equal(sql("select md5(coalesce(string_agg(md5(to_jsonb(i)::text),'' order by id),'')||coalesce((select string_agg(md5(to_jsonb(e)::text),'' order by request_id) from social_account_identity_events e),'')) from social_account_identities i;"),before);
    assert.equal(sql(`select status||':'||version from social_account_oauth_attempts where id='${uuid(240)}';`),'processing:2');
    assert.equal(finish(2,240,'failed','identity_conflict').status,'failed');
  });

  await check('injected verified-event failure rolls back the canonical identity and permits exact retry',()=>{
    start(3,250);claim(3,250);
    sql("create function fail_tiktok_verified_event() returns trigger language plpgsql as $$begin if new.status='verified' then raise exception 'INJECTED_TIKTOK_EVENT_FAILURE';end if;return new;end$$;create trigger injected_tiktok_event after insert on social_account_oauth_attempt_events for each row execute function fail_tiktok_verified_event();");
    const before=sql("select count(*)||':'||(select count(*) from social_account_identity_events) from social_account_identities;");
    failure(call(3,`select complete_tiktok_social_account_link('$session$','${uuid(250)}',2,'subject-three','creator.three','@creator.three');`),/INJECTED_TIKTOK_EVENT_FAILURE/u);
    assert.equal(sql("select count(*)||':'||(select count(*) from social_account_identity_events) from social_account_identities;"),before);
    assert.equal(sql(`select status||':'||version from social_account_oauth_attempts where id='${uuid(250)}';`),'processing:2');
    sql('drop trigger injected_tiktok_event on social_account_oauth_attempt_events;drop function fail_tiktok_verified_event();');
    assert.equal(complete(3,250,'subject-three','creator.three').version,1);
  });

  await check('terminal finish replays exactly and processing expiry is recorded explicitly',()=>{
    assert.equal(finish(2,240,'failed','identity_conflict').status,'failed');
    sql(`insert into social_account_oauth_attempts(id,owner_discord_user_id,initiating_session_id,provider,state_digest,expected_identity_version,status,version,created_at,expires_at,claimed_at) values('${uuid(255)}','6','${uuid(6)}','tiktok','${digest(255)}',0,'processing',2,now()-interval '11 minutes',now()-interval '1 minute',now()-interval '2 minutes');insert into social_account_oauth_attempt_events values('${uuid(255)}',1,'pending','started',now()-interval '11 minutes'),('${uuid(255)}',2,'processing','claimed',now()-interval '2 minutes');`);
    failure(call(6,`select complete_tiktok_social_account_link('$session$','${uuid(255)}',2,'expired-subject','expired','@expired');`),/SOCIAL_TIKTOK_ATTEMPT_EXPIRED/u);
    assert.equal(finish(6,255,'failed','provider_unavailable').status,'expired');
    assert.equal(finish(6,255,'failed','provider_unavailable').status,'expired');
    assert.equal(sql(`select status||':'||status_reason||':'||version from social_account_oauth_attempts where id='${uuid(255)}';`),'expired:expired:3');
  });

  await check('parallel duplicate callbacks produce exactly one claim and no replayed state',async()=>{
    start(4,260);
    const query=call(4,`select claim_tiktok_social_account_link('$session$','${digest(260)}');`);
    const results=await Promise.allSettled([concurrent(query),concurrent(query)]);
    assert.equal(results.filter(item=>item.status==='fulfilled').length,1);assert.equal(results.filter(item=>item.status==='rejected').length,1);
    assert.equal(sql(`select status||':'||version from social_account_oauth_attempts where id='${uuid(260)}';`),'processing:2');
    assert.equal(sql(`select count(*) from social_account_oauth_attempt_events where attempt_id='${uuid(260)}' and status='processing';`),'1');
  });

  await check('attempt and event history reject direct application access and historical rewrites',()=>{
    failure(`update social_account_oauth_attempts set status='failed' where id='${uuid(260)}';`,/SOCIAL_TIKTOK_HISTORY_IMMUTABLE/u);
    failure(`delete from social_account_oauth_attempt_events where attempt_id='${uuid(260)}';`,/SOCIAL_TIKTOK_HISTORY_IMMUTABLE/u);
    failure(`set role service_role;select * from social_account_oauth_attempts;`,/permission denied/u);
    assert.equal(sql("select count(*) from social_account_oauth_attempt_events e left join social_account_oauth_attempts a on a.id=e.attempt_id where a.id is null;"),'0');
  });
}catch(error){primaryError=error;throw error;}finally{
  if(started)try{run('pg_ctl',['-D',data,'-m','fast','-w','stop']);}catch(error){if(!primaryError)throw error;}
  const resolved=realpathSync(directory);if(!resolved.startsWith(root+path.sep))throw Error('Refusing unsafe cleanup path');rmSync(resolved,{recursive:true,force:true});
}
console.log(`PASS ${checks} isolated TikTok PostgreSQL groups; cluster removed.`);
