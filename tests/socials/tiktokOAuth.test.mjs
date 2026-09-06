import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mock,test} from 'node:test';

const session='123e4567-e89b-42d3-a456-426614174000';
const attemptId='123e4567-e89b-42d3-a456-426614174010';
const identityId='123e4567-e89b-42d3-a456-426614174011';
const state={rpcCalls:[],rpc:async()=>({data:null,error:null}),fetchCalls:[],fetch:async()=>{throw Error('unexpected fetch');},auth:null,closed:false};

mock.module(new URL('../../lib/db/admin.ts',import.meta.url),{namedExports:{supabaseAdmin:{async rpc(name,parameters){
  state.rpcCalls.push({name,parameters});return state.rpc(name,parameters);
}}}});
mock.module(new URL('../../lib/auth/requireSession.ts',import.meta.url),{namedExports:{async requireSession(){
  if(state.auth)throw state.auth;return {session_id:session,discord_user_id:'private-owner'};
}}});
mock.module(new URL('../../lib/writeGate.server.ts',import.meta.url),{namedExports:{
  assertServerMutationAllowed(){if(state.closed)throw Error('closed');},
  enforceRouteMutationGate(){return state.closed?Response.json({error:'unavailable'},{status:503}):null;},
}});
const fetchMock=mock.method(globalThis,'fetch',async(...args)=>{state.fetchCalls.push(args);return state.fetch(...args);});

process.env.NEXT_PUBLIC_BASE_URL='https://dev.cancerculture.example';
process.env.TIKTOK_LOGIN_KIT_MODE='sandbox';
process.env.TIKTOK_CLIENT_KEY='test-client-key';
process.env.TIKTOK_CLIENT_SECRET='test-client-secret-value';
process.env.TIKTOK_REDIRECT_URI='https://dev.cancerculture.example/api/profile/social-accounts/tiktok/callback';

const oauth=await import('../../lib/socials/tiktokOAuth.server.ts');
const {POST:startRoute}=await import('../../app/api/profile/social-accounts/tiktok/start/route.ts');
const {GET:callbackRoute}=await import('../../app/api/profile/social-accounts/tiktok/callback/route.ts');
const {AuthError}=await import('../../lib/auth/AuthError.ts');

function reset(){
  Object.assign(state,{rpcCalls:[],rpc:async(name,parameters)=>({data:name==='start_tiktok_social_account_link'?{
    attemptId:parameters.p_attempt_id,expiresAt:'2026-09-06T12:10:00Z'}:null,error:null}),fetchCalls:[],
    fetch:async()=>{throw Error('unexpected fetch');},auth:null,closed:false});
}
function callback(values){
  const params=new URLSearchParams();
  for(const [key,value] of Object.entries(values))for(const item of Array.isArray(value)?value:[value])params.append(key,item);
  return params;
}
function callbackRpc(){
  state.rpc=async(name,parameters)=>({data:name==='claim_tiktok_social_account_link'?{outcome:'claimed',attemptId,version:2}:
    name==='complete_tiktok_social_account_link'?{identityId,version:1}:
    name==='finish_tiktok_social_account_link'?{attemptId,version:3,status:parameters.p_outcome}:null,error:null});
}
function json(value,status=200){return new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});}

test.after(()=>fetchMock.mock.restore());

test('web start is same-origin, session-bound, minimal-scope and deliberately has no PKCE parameters',async()=>{
  reset();
  const result=await oauth.startTikTokOAuth(session);
  const authorize=new URL(result.authorizeUrl);
  const call=state.rpcCalls[0];
  const oauthState=authorize.searchParams.get('state');
  assert.equal(authorize.origin,'https://www.tiktok.com');
  assert.equal(authorize.pathname,'/v2/auth/authorize/');
  assert.equal(authorize.searchParams.get('scope'),'user.info.basic,user.info.profile');
  assert.equal(authorize.searchParams.get('disable_auto_auth'),'1');
  assert.equal(authorize.searchParams.get('response_type'),'code');
  assert.equal(authorize.searchParams.get('redirect_uri'),process.env.TIKTOK_REDIRECT_URI);
  assert.equal(authorize.searchParams.get('code_challenge'),null);
  assert.equal(authorize.searchParams.get('code_challenge_method'),null);
  assert.match(oauthState,/^[A-Za-z0-9_-]{43}$/u);
  assert.deepEqual(call,{name:'start_tiktok_social_account_link',parameters:{p_session_id:session,
    p_attempt_id:call.parameters.p_attempt_id,p_state_digest:createHash('sha256').update(oauthState).digest('hex')}});
  assert.doesNotMatch(JSON.stringify(call),new RegExp(oauthState,'u'));
  assert.doesNotMatch(result.authorizeUrl,/secret/u);

  reset();
  const response=await startRoute(new Request('http://localhost:3000/api/profile/social-accounts/tiktok/start',{
    method:'POST',headers:{Origin:'https://dev.cancerculture.example','Content-Type':'application/json'},body:'{}'}));
  assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/u);
  for(const request of [
    new Request('http://localhost:3000/api/profile/social-accounts/tiktok/start',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}),
    new Request('http://localhost:3000/api/profile/social-accounts/tiktok/start',{method:'POST',headers:{Origin:'https://evil.invalid','Content-Type':'application/json'},body:'{}'}),
    new Request('http://localhost:3000/api/profile/social-accounts/tiktok/start',{method:'POST',headers:{Origin:'https://dev.cancerculture.example','Content-Type':'application/json'},body:'{"provider":"x"}'})]){
    reset();assert.ok((await startRoute(request)).status>=400);assert.equal(state.rpcCalls.length,0);
  }
});

test('missing or mismatched sandbox configuration fails closed before an attempt is written',async()=>{
  reset();const mode=process.env.TIKTOK_LOGIN_KIT_MODE;delete process.env.TIKTOK_LOGIN_KIT_MODE;
  await assert.rejects(oauth.startTikTokOAuth(session),{code:'SOCIAL_TIKTOK_UNAVAILABLE'});
  assert.equal(state.rpcCalls.length,0);process.env.TIKTOK_LOGIN_KIT_MODE=mode;
  const redirect=process.env.TIKTOK_REDIRECT_URI;process.env.TIKTOK_REDIRECT_URI='https://other.invalid/api/profile/social-accounts/tiktok/callback';
  assert.equal(oauth.isTikTokOAuthConfigured(),false);process.env.TIKTOK_REDIRECT_URI=redirect;
  await assert.rejects(oauth.startTikTokOAuth('bad'),{code:'NOT_AUTHENTICATED'});
});

test('successful callback cross-checks scopes and subject, stores only normalized identity and revokes the transient token',async()=>{
  reset();callbackRpc();
  state.fetch=async(input,init)=>{
    const url=new URL(input instanceof Request?input.url:String(input));
    if(url.href==='https://open.tiktokapis.com/v2/oauth/token/'){
      const body=new URLSearchParams(init.body);assert.equal(body.get('code_verifier'),null);
      assert.equal(body.get('code'),'provider-code');assert.equal(body.get('redirect_uri'),process.env.TIKTOK_REDIRECT_URI);
      return json({access_token:'private-access-token',refresh_token:'private-refresh-token',open_id:'app-scoped-owner',
        scope:'user.info.profile,user.info.basic',token_type:'Bearer',expires_in:86400});
    }
    if(url.pathname==='/v2/user/info/'){
      assert.equal(url.searchParams.get('fields'),'open_id,username');
      assert.equal(init.headers.Authorization,'Bearer private-access-token');
      return json({data:{user:{open_id:'app-scoped-owner',display_name:'Creator',username:'creator.name',
        profile_deep_link:'https://www.tiktok.com/@creator.name'}},error:{code:'ok',message:'',log_id:'private-log'}});
    }
    if(url.pathname==='/v2/oauth/revoke/'){
      assert.equal(new URLSearchParams(init.body).get('token'),'private-access-token');return new Response('',{status:200});
    }
    throw Error('unexpected endpoint');
  };
  const result=await oauth.handleTikTokOAuthCallback(session,callback({state:'a'.repeat(43),code:'provider-code',
    scopes:'user.info.basic,user.info.profile'}));
  assert.equal(result,'connected');
  assert.deepEqual(state.rpcCalls.map(item=>item.name),['claim_tiktok_social_account_link','complete_tiktok_social_account_link']);
  const complete=state.rpcCalls[1].parameters;
  assert.deepEqual(complete,{p_session_id:session,p_attempt_id:attemptId,p_attempt_version:2,
    p_provider_account_id:'app-scoped-owner',p_public_locator:'creator.name',p_display_label:'@creator.name'});
  assert.doesNotMatch(JSON.stringify(state.rpcCalls),/private-access|private-refresh|private-log/u);
  assert.equal(state.fetchCalls.length,3);
});

test('an uncertain completion receipt is retried exactly once and resolves through database replay',async()=>{
  reset();let completionCalls=0;
  state.rpc=async(name)=>{
    if(name==='claim_tiktok_social_account_link')return {data:{outcome:'claimed',attemptId,version:2},error:null};
    if(name==='complete_tiktok_social_account_link'){
      completionCalls++;
      return completionCalls===1?{data:null,error:{code:'XX000',message:'response unavailable'}}:
        {data:{identityId,version:1},error:null};
    }
    return {data:null,error:null};
  };
  state.fetch=async(input)=>String(input).includes('/oauth/token/')?
    json({access_token:'token',open_id:'owner',scope:'user.info.basic,user.info.profile',token_type:'Bearer'}):
    String(input).includes('/user/info/')?
      json({data:{user:{open_id:'owner',display_name:'Creator',username:'creator',profile_deep_link:'https://www.tiktok.com/@creator'}},error:{code:'ok'}}):
      new Response('',{status:200});
  assert.equal(await oauth.handleTikTokOAuthCallback(session,callback({state:'n'.repeat(43),code:'code',
    scopes:'user.info.basic,user.info.profile'})),'connected');
  assert.equal(completionCalls,2);
  assert.equal(state.rpcCalls.filter(item=>item.name==='finish_tiktok_social_account_link').length,0);
});

test('denied consent and partial consent consume the attempt once without calling identity APIs',async()=>{
  for(const [params,result,reason] of [
    [{state:'b'.repeat(43),error:'access_denied',error_description:'private'},'cancelled','consent_denied'],
    [{state:'c'.repeat(43),code:'provider-code',scopes:'user.info.basic'},'missing_scope','missing_scope'],
  ]){
    reset();callbackRpc();assert.equal(await oauth.handleTikTokOAuthCallback(session,callback(params)),result);
    assert.deepEqual(state.rpcCalls.map(item=>item.name),['claim_tiktok_social_account_link','finish_tiktok_social_account_link']);
    assert.equal(state.rpcCalls[1].parameters.p_reason,reason);assert.equal(state.fetchCalls.length,0);
  }
});

test('invalid provider identities, provider timeout and identity conflicts fail closed and finish the claimed attempt',async()=>{
  reset();callbackRpc();let count=0;
  state.fetch=async(input)=>{
    const url=new URL(String(input));count++;
    if(count===1)return json({access_token:'private-access-token',open_id:'owner',scope:'user.info.basic,user.info.profile',token_type:'Bearer'});
    if(url.pathname==='/v2/user/info/')return json({data:{user:{open_id:'owner',username:'creator/invalid'}},error:{code:'ok'}});
    return new Response('',{status:200});
  };
  assert.equal(await oauth.handleTikTokOAuthCallback(session,callback({state:'d'.repeat(43),code:'code',scopes:'user.info.basic,user.info.profile'})),'invalid_identity');
  assert.equal(state.rpcCalls.at(-1).parameters.p_reason,'invalid_provider_identity');

  reset();callbackRpc();state.fetch=async()=>{throw Error('timeout private token');};
  assert.equal(await oauth.handleTikTokOAuthCallback(session,callback({state:'e'.repeat(43),code:'code',scopes:'user.info.basic,user.info.profile'})),'unavailable');
  assert.equal(state.rpcCalls.at(-1).parameters.p_reason,'provider_unavailable');

  reset();callbackRpc();state.rpc=async(name)=>name==='claim_tiktok_social_account_link'?{data:{outcome:'claimed',attemptId,version:2},error:null}:
    name==='complete_tiktok_social_account_link'?{data:null,error:{code:'P0001',message:'SOCIAL_IDENTITY_NOT_AVAILABLE'}}:
    {data:{attemptId,version:3,status:'failed'},error:null};
  state.fetch=async(input)=>String(input).includes('/oauth/token/')?json({access_token:'token',open_id:'owner',scope:'user.info.basic,user.info.profile',token_type:'Bearer'}):
    String(input).includes('/user/info/')?json({data:{user:{open_id:'owner',display_name:'Creator',username:'creator',profile_deep_link:'https://www.tiktok.com/@creator'}},error:{code:'ok'}}):new Response('',{status:200});
  assert.equal(await oauth.handleTikTokOAuthCallback(session,callback({state:'f'.repeat(43),code:'code',scopes:'user.info.basic,user.info.profile'})),'conflict');
  assert.equal(state.rpcCalls.at(-1).parameters.p_reason,'identity_conflict');
});

test('state replay, owner-session mismatch, expiry and duplicate callback parameters are neutral',async()=>{
  for(const [error,result] of [[{code:'28000',message:'private owner'},'session'],[{code:'P0001',message:'SOCIAL_TIKTOK_NOT_AVAILABLE'},'conflict']]){
    reset();state.rpc=async()=>({data:null,error});
    assert.equal(await oauth.handleTikTokOAuthCallback(session,callback({state:'g'.repeat(43),code:'code',scopes:'user.info.basic,user.info.profile'})),result);
    assert.equal(state.rpcCalls.length,1);assert.equal(state.fetchCalls.length,0);
  }
  reset();state.rpc=async()=>({data:{outcome:'expired'},error:null});
  assert.equal(await oauth.handleTikTokOAuthCallback(session,callback({state:'h'.repeat(43),code:'code',scopes:'user.info.basic,user.info.profile'})),'expired');
  reset();assert.equal(await oauth.handleTikTokOAuthCallback(session,callback({state:['i'.repeat(43),'j'.repeat(43)],code:'code',scopes:'user.info.basic,user.info.profile'})),'invalid');
  assert.equal(state.rpcCalls.length,0);
});

test('an attempt expiring during provider work is finalized and reported as expired',async()=>{
  reset();callbackRpc();
  state.rpc=async(name)=>{
    if(name==='claim_tiktok_social_account_link')return {data:{outcome:'claimed',attemptId,version:2},error:null};
    if(name==='complete_tiktok_social_account_link')return {data:null,error:{code:'P0001',message:'SOCIAL_TIKTOK_ATTEMPT_EXPIRED'}};
    if(name==='finish_tiktok_social_account_link')return {data:{attemptId,version:3,status:'expired'},error:null};
    return {data:null,error:null};
  };
  state.fetch=async(input)=>String(input).includes('/oauth/token/')?
    json({access_token:'token',open_id:'owner',scope:'user.info.basic,user.info.profile',token_type:'Bearer'}):
    String(input).includes('/user/info/')?
      json({data:{user:{open_id:'owner',display_name:'Creator',username:'creator',profile_deep_link:'https://www.tiktok.com/@creator'}},error:{code:'ok'}}):
      new Response('',{status:200});
  assert.equal(await oauth.handleTikTokOAuthCallback(session,callback({state:'o'.repeat(43),code:'code',
    scopes:'user.info.basic,user.info.profile'})),'expired');
  assert.equal(state.rpcCalls.at(-1).name,'finish_tiktok_social_account_link');
  assert.equal(state.rpcCalls.at(-1).parameters.p_reason,'provider_unavailable');
});

test('callback route strips code and state from the internal return and never creates a CancerCulture session',async()=>{
  reset();callbackRpc();state.fetch=async(input)=>String(input).includes('/oauth/token/')?json({access_token:'token',open_id:'owner',scope:'user.info.basic,user.info.profile',token_type:'Bearer'}):
    String(input).includes('/user/info/')?json({data:{user:{open_id:'owner',display_name:'Creator',username:'creator',profile_deep_link:'https://www.tiktok.com/@creator'}},error:{code:'ok'}}):new Response('',{status:200});
  const response=await callbackRoute(new Request(`https://dev.cancerculture.example/api/profile/social-accounts/tiktok/callback?state=${'k'.repeat(43)}&code=private-code&scopes=user.info.basic%2Cuser.info.profile`));
  const location=response.headers.get('location');
  assert.equal(response.status,303);assert.match(location,/\/settings\/profile\?social=tiktok&result=connected#connected-social-accounts$/u);
  assert.doesNotMatch(location,/private-code|state=/u);assert.equal(response.headers.get('referrer-policy'),'no-referrer');
  assert.doesNotMatch(JSON.stringify(state.rpcCalls),/create_cancerculture_session|discord_user_id/u);

  reset();state.closed=true;
  const closed=await callbackRoute(new Request(`https://dev.cancerculture.example/api/profile/social-accounts/tiktok/callback?state=${'l'.repeat(43)}`));
  assert.match(closed.headers.get('location'),/result=unavailable/u);assert.equal(state.rpcCalls.length,0);
  reset();state.auth=new AuthError(401,'private session','NOT_AUTHENTICATED');
  const anonymous=await callbackRoute(new Request(`https://dev.cancerculture.example/api/profile/social-accounts/tiktok/callback?state=${'m'.repeat(43)}`));
  assert.match(anonymous.headers.get('location'),/result=session/u);assert.equal(state.rpcCalls.length,0);
});
