import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { readFile } from 'node:fs/promises';
const profile='00000000-0000-4000-8000-000000000021';
const other='00000000-0000-4000-8000-000000000022';
const link={provider:'x',displayLabel:'Fixture',url:'https://x.com/fixture'};
const state={};
function reset(){Object.assign(state,{calls:[],rpcCalls:[],rows:[{id:1,cycle_id:10,discord_user_id:'private-owner',is_disqualified:false,public_visibility_status:'visible'}],cycles:[{id:10,status:'finished'}],users:[{discord_user_id:'private-owner',public_profile_id:profile}],active:true,profileOptIn:true,submissionOptIn:true,link,error:null,badDto:null});}
function builder(table){
 const filters=[];
 const chain={select(){return chain;},in(k,v){filters.push(r=>v.includes(r[k]));return chain;},eq(k,v){filters.push(r=>r[k]===v);return chain;},then(resolve,reject){
   state.calls.push(table);
   const data=({submissions:state.rows,voting_cycles:state.cycles,user_logs:state.users})[table];
   assert.ok(data,'Unexpected source '+table);
   return Promise.resolve({data:data.filter(r=>filters.every(f=>f(r))),error:state.error?.table===table?state.error:null}).then(resolve,reject);
 }};return chain;
}
mock.module(new URL('../../lib/db/server.ts',import.meta.url),{namedExports:{supabaseServer:{from:builder}}});
mock.module(new URL('../../lib/db/admin.ts',import.meta.url),{namedExports:{supabaseAdmin:{rpc:async(name,p)=>{
 state.rpcCalls.push({name,p});
 assert.equal(name,'get_public_social_account_identities');
 return {data:state.badDto??(state.active && p.p_public_profile_id===profile && (p.p_surface==='profile'?state.profileOptIn:state.submissionOptIn)?[state.link]:[]),error:state.error?.table==='rpc'?state.error:null};
}}}});
const {getSubmissionSocialLinksBySubmissionIds:read}=await import('../../lib/socials/getSubmissionSocialLinks.ts');
const {loadPublicSocialAccountIdentities:publicRead}=await import('../../lib/socials/socialAccountIdentities.server.ts');
test.beforeEach(reset);
test('historical submission resolves its actual owner, with only the three approved public fields',async()=>{
 assert.deepEqual([...(await read([1,1])).entries()],[[1,[link]]]);
 assert.deepEqual(state.rpcCalls,[{name:'get_public_social_account_identities',p:{p_public_profile_id:profile,p_surface:'submission'}}]);
 assert.doesNotMatch(JSON.stringify([...(await read([1])).values()]),/private-owner|identityId|is_verified/);
});
test('invalid, absent and manipulated IDs cannot expand the concrete submission lookup',async()=>{
 assert.equal((await read([-1,0,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,'1',99])).size,0);
 assert.equal(state.rpcCalls.length,0);
 state.rows[0].discord_user_id='different-owner';
 assert.deepEqual([...(await read([1])).values()],[[]]);assert.equal(state.rpcCalls.length,0);
});
test('hidden, unknown visibility, disqualified and unrevealed submissions never resolve social identity',async()=>{
 for(const visibility of ['removed','legal_review',null,'unknown']){reset();state.rows[0].public_visibility_status=visibility;assert.equal((await read([1])).size,0);assert.equal(state.rpcCalls.length,0);}
 reset();state.rows[0].is_disqualified=true;assert.equal((await read([1])).size,0);
 for(const status of ['submission_open','active','voting_open','finalizing']){reset();state.cycles[0].status=status;assert.equal((await read([1])).size,0);assert.equal(state.rpcCalls.length,0);}
});
test('profile and historical submission consent are independent on every new read',async()=>{
 for(const profileOptIn of [true,false])for(const submissionOptIn of [true,false]){
  state.profileOptIn=profileOptIn;state.submissionOptIn=submissionOptIn;
  assert.deepEqual(await publicRead(profile,'profile'),profileOptIn?[link]:[]);
  assert.deepEqual((await read([1])).get(1),submissionOptIn?[link]:[]);
 }
});
test('disconnect, revoke, opt-out and new generation cannot revive an old historical snapshot',async()=>{
 assert.deepEqual((await read([1])).get(1),[link]);
 state.active=false;assert.deepEqual((await read([1])).get(1),[]);
 state.active=true;state.link={...link,displayLabel:'New generation',url:'https://x.com/newfixture'};
 assert.deepEqual((await read([1])).get(1),[state.link]);
 state.submissionOptIn=false;assert.deepEqual((await read([1])).get(1),[]);
 assert.equal(state.calls.includes('submission_social_links'),false);
 assert.equal(state.calls.includes('user_social_links'),false);
});
test('two owners and cycles stay separate; per-call deduplication does not cache a later response',async()=>{
 state.rows.push({...state.rows[0],id:2},{...state.rows[0],id:3,discord_user_id:'other',cycle_id:11});
 state.cycles.push({id:11,status:'finished'});state.users.push({discord_user_id:'other',public_profile_id:other});
 const result=await read([1,2,3]);assert.deepEqual(result.get(1),[link]);assert.deepEqual(result.get(2),[link]);assert.deepEqual(result.get(3),[]);
 assert.equal(state.rpcCalls.length,2);state.active=false;assert.deepEqual((await read([1])).get(1),[]);
});
test('source failure, malicious URL or private DTO field fail closed without diagnostics or legacy fallback',async()=>{
 const log=mock.method(console,'error',()=>{});
 try{
  for(const table of ['submissions','voting_cycles','user_logs','rpc']){reset();state.error={table,code:'XX000',message:'private-proof'};await assert.rejects(read([1]),e=>!e.message.includes('private-proof'));}
  for(const dto of [[{...link,url:'https://evil.invalid/x'}],[{...link,proofId:'private'}],[{...link,identityId:profile}]]){reset();state.badDto=dto;await assert.rejects(read([1]),{code:'SOCIAL_IDENTITY_UNAVAILABLE'});}
  assert.equal(log.mock.calls.length,0);
 }finally{log.mock.restore();}
});
test('direct legacy create, edit, delete, verify and unverify requests are inert',async()=>{
 for(const [path,methods] of [['profile/socials',['POST']],['profile/socials/[socialId]',['PATCH','DELETE']],['admin/socials/[socialId]/verify',['POST']],['admin/socials/[socialId]/unverify',['POST']]]){
  const routeModule=await import('../../app/api/'+path+'/route.ts');
  for(const method of methods){const response=await routeModule[method](new Request('http://localhost/api/'+path,{method,body:JSON.stringify({owner:'other',is_verified:true,url:'https://evil.invalid'})}),{params:Promise.resolve({socialId:'1'})});
   assert.equal(response.status,410);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal((await response.json()).code,'SOCIAL_LEGACY_RETIRED');}
 }
 assert.deepEqual(state.calls,[]);assert.deepEqual(state.rpcCalls,[]);
});
test('all established historical public consumers use the canonical shared reader and no persistent social cache',async()=>{
 for(const file of ['lib/walls/getPublicWallPage.ts','lib/cycles/getCycleHistoryData.ts','lib/feed/communityFeedDetail.server.ts']){
  const source=await readFile(new URL('../../'+file,import.meta.url),'utf8');
  assert.match(source,/getSubmissionSocialLinksBySubmissionIds/);assert.doesNotMatch(source,/unstable_cache|use cache|submission_social_links/);
 }
 for(const file of ['app/profile/[publicProfileId]/page.tsx','app/wall/fame/page.tsx','app/wall/shame/page.tsx'])assert.match(await readFile(new URL('../../'+file,import.meta.url),'utf8'),/force-dynamic/);
});
