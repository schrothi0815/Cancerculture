import assert from 'node:assert/strict';
import test,{mock} from 'node:test';
const session='00000000-0000-4000-8000-000000000001';
const state={};
mock.module(new URL('../../lib/socials/socialAccountManagement.server.ts',import.meta.url),{namedExports:{loadOwnSocialAccountManagement:async id=>{state.session=id;if(state.error)throw Error('private database detail');return state.data;}}});
const{getUserSocialSettings}=await import('../../lib/socials/getUserSocialSettings.ts');
test.beforeEach(()=>{Object.assign(state,{error:false,data:{identities:[{provider:'youtube',state:'active'},{provider:'x',state:'disconnected'},{provider:'tiktok',state:'revoked'}],visibility:{submissions:true}},session:null});});
test('upload status comes from the own canonical session and excludes terminal generations',async()=>{
 assert.deepEqual(await getUserSocialSettings(session),{available:true,showSocialsOnSubmissions:true,socialCount:1,verifiedSocialCount:1,socialPlatforms:['youtube']});assert.equal(state.session,session);
});
test('upload may proceed when social status is unavailable without claiming an empty account',async()=>{
 state.error=true;assert.deepEqual(await getUserSocialSettings(session),{available:false,showSocialsOnSubmissions:false,socialCount:0,verifiedSocialCount:0,socialPlatforms:[]});
});
test('submission opt-out is independent of active canonical accounts',async()=>{
 state.data.visibility.submissions=false;const result=await getUserSocialSettings(session);assert.equal(result.showSocialsOnSubmissions,false);assert.equal(result.verifiedSocialCount,1);
});
