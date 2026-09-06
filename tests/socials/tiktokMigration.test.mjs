import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const sql=await readFile(new URL('../../supabase/migrations/20260906000200_social_account_tiktok_oauth.sql',import.meta.url),'utf8');

test('TikTok migration is additive, baseline-pinned and contains no token storage',()=>{
  assert.match(sql,/SOCIAL_TIKTOK_BASELINE_MISMATCH/u);
  assert.match(sql,/from pg_proc p join pg_namespace n[\s\S]*p[.]proname in \([\s\S]*'complete_tiktok_social_account_link'/u);
  assert.match(sql,/create table public[.]social_account_oauth_attempts/u);
  assert.match(sql,/create table public[.]social_account_oauth_attempt_events/u);
  assert.doesNotMatch(sql,/access_token|refresh_token|authorization_code|provider_response|profile_deep_link/iu);
  assert.match(sql,/state_digest text not null unique[\s\S]*\^\[0-9a-f\]\{64\}\$/u);
  assert.match(sql,/initiating_session_id uuid not null/u);
  assert.match(sql,/where status in \('pending','processing'\)/u);
});

test('attempt transitions are versioned, append-only and bounded by database time',()=>{
  assert.match(sql,/interval '10 minutes'/u);
  assert.match(sql,/protect_social_account_oauth_attempt_history/u);
  assert.match(sql,/SOCIAL_TIKTOK_HISTORY_IMMUTABLE/u);
  assert.match(sql,/old[.]status = 'pending'[\s\S]*new[.]status = 'processing'[\s\S]*new[.]version = 2/u);
  assert.match(sql,/old[.]status = 'processing'[\s\S]*new[.]status in \('verified','denied','failed','expired'\)[\s\S]*new[.]version = 3/u);
  assert.match(sql,/primary key \(attempt_id, attempt_version\)/u);
  assert.match(sql,/v_attempt[.]status = 'verified'[\s\S]*return jsonb_build_object\('identityId',v_attempt[.]result_identity_id,'version',1\)/u);
  assert.match(sql,/SOCIAL_TIKTOK_ATTEMPT_EXPIRED/u);
});

test('start and callback bind session, unlock, state digest and exact provider locks',()=>{
  for(const signature of [
    'start_tiktok_social_account_link',
    'claim_tiktok_social_account_link',
    'finish_tiktok_social_account_link',
    'complete_tiktok_social_account_link',
  ])assert.match(sql,new RegExp(`create function public[.]${signature}`,'u'));
  assert.match(sql,/v_owner := public[.]require_account_session\(p_session_id\)/u);
  assert.match(sql,/initiating_session_id <> p_session_id/u);
  assert.match(sql,/social_account_linking_unlocks where owner_discord_user_id = v_owner/u);
  assert.match(sql,/lock_social_account_identity_request\(p_attempt_id,v_owner,'tiktok'\)/u);
  assert.match(sql,/state_digest = p_state_digest and provider = 'tiktok'/u);
});

test('only the TikTok adapter reaches the internal canonical writer with captured CAS',()=>{
  assert.match(sql,/public[.]record_social_account_identity\([\s\S]*p_attempt_id,'tiktok',p_provider_account_id,p_public_locator,[\s\S]*v_attempt[.]expected_identity_id,v_attempt[.]expected_identity_version/u);
  assert.match(sql,/result_identity_id=v_identity_id/u);
  const grant=sql.slice(sql.lastIndexOf('grant execute on function'));
  assert.match(grant,/start_tiktok_social_account_link/u);
  assert.match(grant,/claim_tiktok_social_account_link/u);
  assert.match(grant,/finish_tiktok_social_account_link/u);
  assert.match(grant,/complete_tiktok_social_account_link/u);
  assert.doesNotMatch(grant,/record_social_account_identity|end_social_account_identity|revoke/u);
});

test('new tables and functions remain postgres-owned, RLS-closed and service-only at exact entrypoints',()=>{
  assert.match(sql,/alter table public[.]social_account_oauth_attempts owner to postgres/u);
  assert.match(sql,/alter table public[.]social_account_oauth_attempt_events owner to postgres/u);
  assert.match(sql,/enable row level security/u);
  assert.match(sql,/revoke all on public[.]social_account_oauth_attempts, public[.]social_account_oauth_attempt_events[\s\S]*from public, anon, authenticated, service_role, discord_bot/u);
  assert.match(sql,/revoke all on function public[.]' \|\| v_signature[\s\S]*from public, anon, authenticated, service_role, discord_bot/u);
  assert.match(sql,/to service_role;\s*$/u);
});
