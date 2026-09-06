import assert from 'node:assert/strict';
import {mock,test} from 'node:test';
const state={data:[],error:null,calls:[]};
mock.module(new URL('../../lib/db/admin.ts',import.meta.url),{namedExports:{supabaseAdmin:{async rpc(name,parameters){state.calls.push({name,parameters});return {data:state.data,error:state.error};}}}});
const {loadOwnSocialAccountIdentities,loadPublicSocialAccountIdentities,disconnectOwnSocialAccountIdentity}=await import('../../lib/socials/socialAccountIdentities.server.ts');
const session='123e4567-e89b-42d3-a456-426614174000';
const id='123e4567-e89b-42d3-a456-426614174001';
const request='123e4567-e89b-42d3-a456-426614174002';
const pub={provider:'x',displayLabel:'Creator',url:'https://x.com/fixture'};
const own={...pub,identityId:id,version:1,state:'active',verifiedAt:'2026-09-05T00:00:00Z',endedAt:null};
function reset(data=[]){state.data=data;state.error=null;state.calls=[];}
test('own reader derives owner solely from session and freezes minimized DTOs',async()=>{
  reset([own]);const result=await loadOwnSocialAccountIdentities(session);
  assert.deepEqual(result,[own]);assert.ok(Object.isFrozen(result)&&Object.isFrozen(result[0]));
  assert.deepEqual(state.calls,[{name:'get_own_social_account_identities',parameters:{p_session_id:session}}]);
});
test('invalid sessions and invalid disconnect input cannot reach database',async()=>{
  reset();for(const value of ['', 'owner',session+' ']){
    await assert.rejects(loadOwnSocialAccountIdentities(value),{code:'NOT_AUTHENTICATED'});
    await assert.rejects(disconnectOwnSocialAccountIdentity(value,id,1,request),{code:'NOT_AUTHENTICATED'});
  }
  for(const values of [[id,2,request],['bad',1,request],[id,1,'bad']])await assert.rejects(disconnectOwnSocialAccountIdentity(session,...values),{code:'SOCIAL_IDENTITY_REQUEST_INVALID'});
  assert.equal(state.calls.length,0);
});
test('own reader accepts terminal latest generation without disclosing proof or subject',async()=>{
  for(const status of ['disconnected','revoked']){
    reset([{...own,state:status,version:2,endedAt:'2026-09-06T00:00:00Z'}]);
    assert.equal((await loadOwnSocialAccountIdentities(session))[0].state,status);
  }
});
test('public reader uses public UUID and explicit surface, no private owner input or cache',async()=>{
  reset([pub]);assert.deepEqual(await loadPublicSocialAccountIdentities(id,'profile'),[pub]);
  state.data=[];assert.deepEqual(await loadPublicSocialAccountIdentities(id,'submission'),[]);
  assert.deepEqual(state.calls.map(c=>c.parameters),[{p_public_profile_id:id,p_surface:'profile'},{p_public_profile_id:id,p_surface:'submission'}]);
  assert.deepEqual(await loadPublicSocialAccountIdentities('123','profile'),[]);
  assert.deepEqual(await loadPublicSocialAccountIdentities(id,'other'),[]);assert.equal(state.calls.length,2);
});
test('all five providers use strictly bounded canonical links',async()=>{
  const links=[pub,{provider:'tiktok',displayLabel:'Creator',url:'https://www.tiktok.com/@fixture'},
    {provider:'youtube',displayLabel:'Channel',url:'https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv'},
    {provider:'instagram',displayLabel:'Creator',url:'https://www.instagram.com/fixture'},
    {provider:'facebook',displayLabel:'Creator',url:'https://www.facebook.com/fixture'}];
  reset(links);assert.deepEqual(await loadPublicSocialAccountIdentities(id,'profile'),links);
});
test('malformed, duplicate, unknown and over-disclosing public DTOs fail closed',async()=>{
  const bad=[null,{},[null],[{...pub,provider:'discord'}],[{...pub,provider:'__proto__'}],
    [pub,pub],Array(6).fill(pub),[{...pub,providerAccountId:'private'}],[{...pub,identityId:id}],
    [{...pub,url:'https://evil.invalid/fixture'}],[{...pub,url:'https://x.com@evil.invalid/fixture'}],
    [{...pub,url:'https://x.com/intent'}],[{...pub,url:'https://x.com/fixture?private=id'}],
    [{...pub,url:'https://x.com/fixture#fragment'}],[{...pub,url:'https://x.com/fixture\n'}],
    [{...pub,url:'http://x.com/fixture'}],[{...pub,url:'https://x.com:443/fixture'}],
    [{...pub,url:'https://x.com/%66ixture'}],[{...pub,displayLabel:'\u0000private'}],
    [{...pub,displayLabel:' '}],[{...pub,displayLabel:'x'.repeat(101)}]];
  for(const value of bad){reset(value);await assert.rejects(loadPublicSocialAccountIdentities(id,'profile'),{code:'SOCIAL_IDENTITY_UNAVAILABLE'});}
});
test('own DTO rejects invalid state/version/time combinations and private metadata',async()=>{
  for(const value of [{...own,version:2},{...own,state:'pending'},{...own,endedAt:own.verifiedAt},
    {...own,state:'revoked',version:2,endedAt:null},{...own,state:'disconnected',version:2,endedAt:'2025-01-01'},
    {...own,verifiedAt:'invalid'},{...own,proof:'private'},{...own,identityId:'invalid'}]){
    reset([value]);await assert.rejects(loadOwnSocialAccountIdentities(session),{code:'SOCIAL_IDENTITY_UNAVAILABLE'});
  }
});
test('disconnect carries exact generation CAS and request UUID, accepting only exact receipt',async()=>{
  reset({identityId:id,version:2});assert.deepEqual(await disconnectOwnSocialAccountIdentity(session,id,1,request),{identityId:id,version:2});
  assert.deepEqual(state.calls,[{name:'disconnect_own_social_account_identity',parameters:{p_session_id:session,p_identity_id:id,p_expected_version:1,p_request_id:request}}]);
  for(const value of [{identityId:request,version:2},{identityId:id,version:1},{identityId:id,version:2,owner:'private'}]){
    reset(value);await assert.rejects(disconnectOwnSocialAccountIdentity(session,id,1,request),{code:'SOCIAL_IDENTITY_UNAVAILABLE'});
  }
});
test('database diagnostics are neither returned nor logged; auth and conflict remain neutral',async()=>{
  const log=mock.method(console,'error',()=>{});
  try{
    for(const [error,code] of [[{code:'28000',message:'private session'},'NOT_AUTHENTICATED'],
      [{code:'P0001',message:'SOCIAL_IDENTITY_NOT_AVAILABLE',details:'other owner'},'SOCIAL_IDENTITY_CONFLICT'],
      [{code:'P0001',message:'SOCIAL_IDENTITY_REQUEST_INVALID'},'SOCIAL_IDENTITY_CONFLICT'],
      [{code:'XX000',message:'private metadata'},'SOCIAL_IDENTITY_UNAVAILABLE']]){
      reset();state.error=error;await assert.rejects(loadOwnSocialAccountIdentities(session),e=>e.code===code&&!e.message.includes('private'));
    }
    assert.equal(log.mock.calls.length,0);
  }finally{log.mock.restore();}
});
