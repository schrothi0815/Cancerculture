import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
const session='123e4567-e89b-42d3-a456-426614174000',id='123e4567-e89b-42d3-a456-426614174001',requestId='123e4567-e89b-42d3-a456-426614174002';
process.env.NEXT_PUBLIC_BASE_URL='https://dev.cancerculture.example';
process.env.TIKTOK_LOGIN_KIT_MODE='sandbox';
process.env.TIKTOK_CLIENT_KEY='test-client-key';
process.env.TIKTOK_CLIENT_SECRET='test-client-secret-value';
process.env.TIKTOK_REDIRECT_URI='https://dev.cancerculture.example/api/profile/social-accounts/tiktok/callback';
const state={calls:[],error:null,visibility:{profile:false,submissions:false,version:0,canEnable:false},identities:[],linking:{eligibleCycles:5,requiredCycles:5,unlocked:true,unlockedAt:'2026-09-05T00:00:00Z'},receipt:{version:1},auth:null,closed:false};
mock.module(new URL('../../lib/db/admin.ts',import.meta.url),{namedExports:{supabaseAdmin:{async rpc(name,parameters){
  state.calls.push({name,parameters});
  return {error:state.error,data:name==='get_own_social_account_identities'?state.identities:name==='get_own_social_account_visibility'?state.visibility:name==='get_own_social_account_linking_status'?state.linking:name==='disconnect_own_social_account_identity'?{identityId:id,version:2}:state.receipt};
}}}});
mock.module(new URL('../../lib/auth/requireSession.ts',import.meta.url),{namedExports:{async requireSession(){if(state.auth)throw state.auth;return {session_id:session,discord_user_id:'private-owner'};}}});
mock.module(new URL('../../lib/writeGate.server.ts',import.meta.url),{namedExports:{assertServerMutationAllowed(){if(state.closed)throw Error('closed');},enforceRouteMutationGate(){return state.closed?Response.json({error:'unavailable'},{status:503}):null;}}});
const {loadOwnSocialAccountVisibility,setOwnSocialAccountVisibility}=await import('../../lib/socials/socialAccountManagement.server.ts');
const {GET,DELETE}=await import('../../app/api/profile/social-accounts/route.ts');
const {PATCH}=await import('../../app/api/profile/social-visibility/route.ts');
const {AuthError}=await import('../../lib/auth/AuthError.ts');
function reset(){Object.assign(state,{calls:[],error:null,visibility:{profile:false,submissions:false,version:0,canEnable:false},identities:[],linking:{eligibleCycles:5,requiredCycles:5,unlocked:true,unlockedAt:'2026-09-05T00:00:00Z'},receipt:{version:1},auth:null,closed:false});}
const input={scope:'profile',value:true,expectedVersion:0,requestId};
const req=(body,method='PATCH',origin='https://dev.cancerculture.example')=>new Request('http://localhost:3000/api/profile/social-visibility',{method,headers:{'Content-Type':'application/json',...(origin?{Origin:origin}:{})},body:typeof body==='string'?body:JSON.stringify(body)});

test('visibility DTO is exact and minimized; malformed or private fields fail closed',async()=>{
  reset();assert.deepEqual(await loadOwnSocialAccountVisibility(session),state.visibility);
  for(const value of [null,[],{}, {...state.visibility,owner:'private'},{...state.visibility,version:-1},{...state.visibility,version:0.1},{...state.visibility,canEnable:'true'}]){
    state.visibility=value;await assert.rejects(loadOwnSocialAccountVisibility(session),{code:'SOCIAL_MANAGEMENT_UNAVAILABLE'});
  }
});
test('bad session, scope, boolean, version, request, owner and provider input cannot call database',async()=>{
  reset();await assert.rejects(setOwnSocialAccountVisibility('bad',input),{code:'NOT_AUTHENTICATED'});
  for(const change of [{scope:'other'},{value:1},{expectedVersion:-1},{expectedVersion:2147483647},{expectedVersion:'0'},{requestId:'bad'},{owner:'other'},{provider:'x'}]){
    await assert.rejects(setOwnSocialAccountVisibility(session,{...input,...change}),{code:'SOCIAL_VISIBILITY_REQUEST_INVALID'});
  }
  assert.equal(state.calls.length,0);
});
test('RPC mutation uses session only, exact CAS and replay UUID; receipt never becomes current status',async()=>{
  reset();assert.equal(await setOwnSocialAccountVisibility(session,input),undefined);
  assert.deepEqual(state.calls,[{name:'set_own_social_account_visibility',parameters:{p_session_id:session,p_scope:'profile',p_value:true,p_expected_version:0,p_request_id:requestId}}]);
  for(const receipt of [{version:2},{version:1,private:'payload'},null]){
    state.receipt=receipt;await assert.rejects(setOwnSocialAccountVisibility(session,input),{code:'SOCIAL_MANAGEMENT_UNAVAILABLE'});
  }
});
test('route origin, JSON, exact keys and write gates reject before mutation',async()=>{
  for(const handler of [PATCH,DELETE]){
    for(const request of [req(input,'PATCH',null),req(input,'PATCH','https://evil.invalid'),req('{'),req({...input,owner:'other'})]){
      reset();assert.ok((await handler(request)).status>=400);assert.equal(state.calls.length,0);
    }
    reset();state.closed=true;assert.equal((await handler(req(input))).status,503);assert.equal(state.calls.length,0);
  }
});
test('anonymous, invalid and revoked authentication responses expose no internal details',async()=>{
  for(const status of [401,403,503])for(const handler of [GET,PATCH,DELETE]){
    reset();state.auth=new AuthError(status,'private token or owner','PRIVATE');
    const body=handler===DELETE?{identityId:id,expectedVersion:1,requestId}:input;
    const response=await handler(req(body));assert.equal(response.status,status);assert.doesNotMatch(await response.text(),/private|token|owner|PRIVATE/u);assert.equal(state.calls.length,0);
  }
});
test('successful and replayed visibility route always reloads current account and preference state',async()=>{
  reset();state.visibility={profile:false,submissions:true,version:7,canEnable:true};
  for(let n=0;n<2;n++){
    state.calls=[];const response=await PATCH(req(input));assert.equal(response.status,200);
    assert.deepEqual(await response.json(),{identities:[],visibility:state.visibility,linkingUnlocked:true,providers:{tiktok:{connectAvailable:true}}});
    assert.match(response.headers.get('cache-control'),/no-store/u);
    assert.deepEqual(state.calls.map(c=>c.name),['set_own_social_account_visibility','get_own_social_account_identities','get_own_social_account_visibility','get_own_social_account_linking_status']);
  }
});
test('disconnect route binds exact identity and version; old replay returns current generation',async()=>{
  reset();state.identities=[{provider:'x',displayLabel:'New account',url:'https://x.com/new',identityId:requestId,version:1,state:'active',verifiedAt:'2026-09-05T00:00:00Z',endedAt:null}];
  const response=await DELETE(req({identityId:id,expectedVersion:1,requestId},'DELETE'));
  assert.equal(response.status,200);assert.equal((await response.json()).identities[0].identityId,requestId);
  assert.deepEqual(state.calls[0],{name:'disconnect_own_social_account_identity',parameters:{p_session_id:session,p_identity_id:id,p_expected_version:1,p_request_id:requestId}});
  for(const extra of [{provider:'x'},{owner:'other'},{expectedVersion:2},{requestId:'bad'},{identityId:77}]){
    reset();assert.equal((await DELETE(req({identityId:id,expectedVersion:1,requestId,...extra},'DELETE'))).status,400);assert.equal(state.calls.length,0);
  }
});
test('database conflicts and unexpected errors are neutral; read failure is not a successful empty state',async()=>{
  for(const [error,status] of [[{code:'28000',message:'private'},401],[{code:'P0001',message:'SOCIAL_VISIBILITY_NOT_AVAILABLE',details:'private'},409],[{code:'XX000',message:'private'},503]]){
    reset();state.error=error;const response=await PATCH(req(input));assert.equal(response.status,status);assert.doesNotMatch(await response.text(),/private|details|identities/u);
  }
  reset();state.error={code:'XX000',message:'private'};const response=await GET();assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/identities|private/u);
});
