-- TikTok Login Kit for Web. Temporary attempts contain no provider tokens or
-- raw provider responses; canonical ownership remains in the existing domain.
do $$
begin
  if to_regclass('public.social_account_identities') is null
    or to_regclass('public.social_account_identity_events') is null
    or to_regclass('public.social_account_visibility_events') is null
    or to_regprocedure('public.record_social_account_identity(uuid,uuid,text,text,text,text,uuid,uuid,integer)') is null
    or to_regprocedure('public.lock_social_account_identity_request(uuid,text,text)') is null
    or to_regclass('public.social_account_oauth_attempts') is not null
    or to_regclass('public.social_account_oauth_attempt_events') is not null
    or exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname in (
        'protect_social_account_oauth_attempt_history',
        'start_tiktok_social_account_link','claim_tiktok_social_account_link',
        'finish_tiktok_social_account_link','complete_tiktok_social_account_link'
      )
    ) then
    raise exception 'SOCIAL_TIKTOK_BASELINE_MISMATCH';
  end if;
end;
$$;

create table public.social_account_oauth_attempts (
  id uuid primary key,
  owner_discord_user_id text not null references public.user_logs(discord_user_id),
  initiating_session_id uuid not null,
  provider text not null check (provider = 'tiktok'),
  state_digest text not null unique check (state_digest ~ '^[0-9a-f]{64}$'),
  expected_identity_id uuid references public.social_account_identities(id),
  expected_identity_version integer not null,
  status text not null default 'pending'
    check (status in ('pending','processing','verified','denied','failed','expired','cancelled')),
  status_reason text,
  version integer not null default 1,
  created_at timestamptz not null,
  expires_at timestamptz not null,
  claimed_at timestamptz,
  completed_at timestamptz,
  result_identity_id uuid references public.social_account_identities(id),
  check ((expected_identity_id is null and expected_identity_version = 0)
    or (expected_identity_id is not null and expected_identity_version = 2)),
  check (expires_at > created_at and expires_at <= created_at + interval '10 minutes 1 second'),
  check (
    (status = 'pending' and version = 1 and status_reason is null
      and claimed_at is null and completed_at is null and result_identity_id is null)
    or (status = 'processing' and version = 2 and status_reason is null
      and claimed_at is not null and completed_at is null and result_identity_id is null)
    or (status in ('cancelled','expired') and version = 2 and status_reason is not null
      and claimed_at is null and completed_at is not null and result_identity_id is null)
    or (status in ('denied','failed','expired') and version = 3 and status_reason is not null
      and claimed_at is not null and completed_at is not null and result_identity_id is null)
    or (status = 'verified' and version = 3 and status_reason = 'verified'
      and claimed_at is not null and completed_at is not null and result_identity_id is not null)
  )
);

create unique index social_account_oauth_attempt_active_owner_provider
  on public.social_account_oauth_attempts(owner_discord_user_id, provider)
  where status in ('pending','processing');
create index social_account_oauth_attempt_owner_history
  on public.social_account_oauth_attempts(owner_discord_user_id, provider, created_at desc);

create table public.social_account_oauth_attempt_events (
  attempt_id uuid not null references public.social_account_oauth_attempts(id),
  attempt_version integer not null check (attempt_version between 1 and 3),
  status text not null
    check (status in ('pending','processing','verified','denied','failed','expired','cancelled')),
  reason text not null check (reason in (
    'started','claimed','verified','superseded','consent_denied','expired',
    'missing_scope','provider_unavailable','invalid_provider_identity','identity_conflict'
  )),
  occurred_at timestamptz not null default clock_timestamp(),
  primary key (attempt_id, attempt_version)
);

create function public.protect_social_account_oauth_attempt_history()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if tg_table_name = 'social_account_oauth_attempt_events' then
    raise exception 'SOCIAL_TIKTOK_HISTORY_IMMUTABLE';
  end if;
  if tg_op <> 'UPDATE'
    or (to_jsonb(new) - array['status','status_reason','version','claimed_at','completed_at','result_identity_id'])
      is distinct from
      (to_jsonb(old) - array['status','status_reason','version','claimed_at','completed_at','result_identity_id']) then
    raise exception 'SOCIAL_TIKTOK_HISTORY_IMMUTABLE';
  end if;
  if old.status = 'pending' and old.version = 1
    and new.status = 'processing' and new.version = 2 and new.status_reason is null
    and new.claimed_at is not null and new.completed_at is null and new.result_identity_id is null then
    return new;
  end if;
  if old.status = 'pending' and old.version = 1
    and new.status in ('cancelled','expired') and new.version = 2
    and new.status_reason is not null and new.claimed_at is null
    and new.completed_at is not null and new.result_identity_id is null then
    return new;
  end if;
  if old.status = 'processing' and old.version = 2
    and new.status in ('verified','denied','failed','expired') and new.version = 3
    and new.status_reason is not null and new.claimed_at = old.claimed_at
    and new.completed_at is not null
    and ((new.status = 'verified' and new.status_reason = 'verified' and new.result_identity_id is not null)
      or (new.status <> 'verified' and new.result_identity_id is null)) then
    return new;
  end if;
  raise exception 'SOCIAL_TIKTOK_HISTORY_IMMUTABLE';
end;
$$;

create trigger social_account_oauth_attempt_guard before update or delete
  on public.social_account_oauth_attempts for each row
  execute function public.protect_social_account_oauth_attempt_history();
create trigger social_account_oauth_attempt_truncate_guard before truncate
  on public.social_account_oauth_attempts for each statement
  execute function public.protect_social_account_oauth_attempt_history();
create trigger social_account_oauth_attempt_events_guard before update or delete or truncate
  on public.social_account_oauth_attempt_events for each statement
  execute function public.protect_social_account_oauth_attempt_history();

create function public.start_tiktok_social_account_link(
  p_session_id uuid, p_attempt_id uuid, p_state_digest text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_owner text;
  v_latest public.social_account_identities%rowtype;
  v_open public.social_account_oauth_attempts%rowtype;
  v_now timestamptz := clock_timestamp();
  v_expires timestamptz;
begin
  v_owner := public.require_account_session(p_session_id);
  if p_attempt_id is null or p_state_digest is null or p_state_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'SOCIAL_TIKTOK_REQUEST_INVALID';
  end if;
  perform public.lock_social_account_identity_request(p_attempt_id, v_owner, 'tiktok');
  perform public.require_account_session(p_session_id);
  if not exists (
    select 1 from public.social_account_linking_unlocks where owner_discord_user_id = v_owner
  ) then
    raise exception 'SOCIAL_TIKTOK_NOT_AVAILABLE';
  end if;

  select * into v_latest from public.social_account_identities
    where owner_discord_user_id = v_owner and provider = 'tiktok'
    order by generation desc limit 1;
  if found and v_latest.state = 'active' then
    raise exception 'SOCIAL_TIKTOK_NOT_AVAILABLE';
  end if;

  select * into v_open from public.social_account_oauth_attempts
    where owner_discord_user_id = v_owner and provider = 'tiktok'
      and status in ('pending','processing') for update;
  if found then
    if v_open.status = 'processing' and v_open.expires_at > v_now then
      raise exception 'SOCIAL_TIKTOK_ATTEMPT_IN_PROGRESS';
    end if;
    update public.social_account_oauth_attempts set
      status = case when v_open.expires_at <= v_now then 'expired' else 'cancelled' end,
      status_reason = case when v_open.expires_at <= v_now then 'expired' else 'superseded' end,
      version = version + 1,
      completed_at = v_now
      where id = v_open.id;
    insert into public.social_account_oauth_attempt_events(attempt_id,attempt_version,status,reason,occurred_at)
      values(v_open.id,v_open.version + 1,
        case when v_open.expires_at <= v_now then 'expired' else 'cancelled' end,
        case when v_open.expires_at <= v_now then 'expired' else 'superseded' end,v_now);
  end if;

  v_expires := v_now + interval '10 minutes';
  insert into public.social_account_oauth_attempts(
    id,owner_discord_user_id,initiating_session_id,provider,state_digest,
    expected_identity_id,expected_identity_version,created_at,expires_at
  ) values(
    p_attempt_id,v_owner,p_session_id,'tiktok',p_state_digest,
    case when v_latest.id is null then null else v_latest.id end,
    case when v_latest.id is null then 0 else v_latest.version end,
    v_now,v_expires
  );
  insert into public.social_account_oauth_attempt_events(attempt_id,attempt_version,status,reason,occurred_at)
    values(p_attempt_id,1,'pending','started',v_now);
  return jsonb_build_object('attemptId',p_attempt_id,'expiresAt',v_expires);
exception when unique_violation or check_violation or foreign_key_violation or not_null_violation then
  raise exception using errcode = 'P0001', message = 'SOCIAL_TIKTOK_NOT_AVAILABLE';
end;
$$;

create function public.claim_tiktok_social_account_link(
  p_session_id uuid, p_state_digest text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_owner text;
  v_attempt public.social_account_oauth_attempts%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  v_owner := public.require_account_session(p_session_id);
  if p_state_digest is null or p_state_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'SOCIAL_TIKTOK_REQUEST_INVALID';
  end if;
  select * into v_attempt from public.social_account_oauth_attempts
    where state_digest = p_state_digest and provider = 'tiktok';
  if not found or v_attempt.owner_discord_user_id <> v_owner
    or v_attempt.initiating_session_id <> p_session_id then
    raise exception 'SOCIAL_TIKTOK_NOT_AVAILABLE';
  end if;
  perform public.lock_social_account_identity_request(v_attempt.id,v_owner,'tiktok');
  perform public.require_account_session(p_session_id);
  select * into v_attempt from public.social_account_oauth_attempts
    where id = v_attempt.id for update;
  if v_attempt.owner_discord_user_id <> v_owner
    or v_attempt.initiating_session_id <> p_session_id
    or v_attempt.status <> 'pending' or v_attempt.version <> 1 then
    raise exception 'SOCIAL_TIKTOK_NOT_AVAILABLE';
  end if;
  if v_attempt.expires_at <= v_now then
    update public.social_account_oauth_attempts set status='expired',status_reason='expired',
      version=2,completed_at=v_now where id=v_attempt.id;
    insert into public.social_account_oauth_attempt_events(attempt_id,attempt_version,status,reason,occurred_at)
      values(v_attempt.id,2,'expired','expired',v_now);
    return jsonb_build_object('outcome','expired');
  end if;
  update public.social_account_oauth_attempts set status='processing',version=2,claimed_at=v_now
    where id=v_attempt.id;
  insert into public.social_account_oauth_attempt_events(attempt_id,attempt_version,status,reason,occurred_at)
    values(v_attempt.id,2,'processing','claimed',v_now);
  return jsonb_build_object('outcome','claimed','attemptId',v_attempt.id,'version',2);
end;
$$;

create function public.finish_tiktok_social_account_link(
  p_session_id uuid, p_attempt_id uuid, p_attempt_version integer,
  p_outcome text, p_reason text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_owner text;
  v_attempt public.social_account_oauth_attempts%rowtype;
  v_now timestamptz := clock_timestamp();
  v_status text;
  v_reason text;
begin
  v_owner := public.require_account_session(p_session_id);
  if p_attempt_id is null or p_attempt_version is distinct from 2
    or p_outcome is null or p_outcome not in ('denied','failed')
    or p_reason is null or p_reason not in ('consent_denied','missing_scope','provider_unavailable',
      'invalid_provider_identity','identity_conflict') then
    raise exception 'SOCIAL_TIKTOK_REQUEST_INVALID';
  end if;
  perform public.lock_social_account_identity_request(p_attempt_id,v_owner,'tiktok');
  perform public.require_account_session(p_session_id);
  select * into v_attempt from public.social_account_oauth_attempts
    where id=p_attempt_id and owner_discord_user_id=v_owner for update;
  if not found or v_attempt.initiating_session_id <> p_session_id then
    raise exception 'SOCIAL_TIKTOK_NOT_AVAILABLE';
  end if;
  if v_attempt.version = 3 and v_attempt.status in ('denied','failed','expired') then
    if (v_attempt.status = 'expired' and v_attempt.status_reason = 'expired')
      or (v_attempt.status = p_outcome and v_attempt.status_reason = p_reason) then
      return jsonb_build_object('attemptId',p_attempt_id,'version',3,'status',v_attempt.status);
    end if;
    raise exception 'SOCIAL_TIKTOK_NOT_AVAILABLE';
  end if;
  if v_attempt.status <> 'processing' or v_attempt.version <> p_attempt_version then
    raise exception 'SOCIAL_TIKTOK_NOT_AVAILABLE';
  end if;
  v_status := case when v_attempt.expires_at <= v_now then 'expired' else p_outcome end;
  v_reason := case when v_attempt.expires_at <= v_now then 'expired' else p_reason end;
  update public.social_account_oauth_attempts set status=v_status,status_reason=v_reason,
    version=3,completed_at=v_now where id=p_attempt_id;
  insert into public.social_account_oauth_attempt_events(attempt_id,attempt_version,status,reason,occurred_at)
    values(p_attempt_id,3,v_status,v_reason,v_now);
  return jsonb_build_object('attemptId',p_attempt_id,'version',3,'status',v_status);
end;
$$;

create function public.complete_tiktok_social_account_link(
  p_session_id uuid, p_attempt_id uuid, p_attempt_version integer,
  p_provider_account_id text, p_public_locator text, p_display_label text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_owner text;
  v_attempt public.social_account_oauth_attempts%rowtype;
  v_receipt jsonb;
  v_identity_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  v_owner := public.require_account_session(p_session_id);
  if p_attempt_id is null or p_attempt_version is distinct from 2
    or p_provider_account_id is null or p_public_locator is null or p_display_label is null then
    raise exception 'SOCIAL_TIKTOK_REQUEST_INVALID';
  end if;
  perform public.lock_social_account_identity_request(p_attempt_id,v_owner,'tiktok');
  perform public.require_account_session(p_session_id);
  select * into v_attempt from public.social_account_oauth_attempts
    where id=p_attempt_id and owner_discord_user_id=v_owner for update;
  if not found or v_attempt.initiating_session_id <> p_session_id then
    raise exception 'SOCIAL_TIKTOK_NOT_AVAILABLE';
  end if;
  if v_attempt.status = 'verified' and v_attempt.version = 3
    and v_attempt.result_identity_id is not null then
    if exists (
      select 1 from public.social_account_identities i
      where i.id = v_attempt.result_identity_id
        and i.owner_discord_user_id = v_owner and i.provider = 'tiktok'
        and i.provider_account_id = p_provider_account_id
        and i.public_locator = p_public_locator and i.display_label = p_display_label
    ) then
      return jsonb_build_object('identityId',v_attempt.result_identity_id,'version',1);
    end if;
    raise exception 'SOCIAL_TIKTOK_NOT_AVAILABLE';
  end if;
  if v_attempt.status <> 'processing' or v_attempt.version <> p_attempt_version then
    raise exception 'SOCIAL_TIKTOK_NOT_AVAILABLE';
  end if;
  if v_attempt.expires_at <= v_now then
    raise exception 'SOCIAL_TIKTOK_ATTEMPT_EXPIRED';
  end if;
  v_receipt := public.record_social_account_identity(
    p_session_id,p_attempt_id,'tiktok',p_provider_account_id,p_public_locator,
    p_display_label,p_attempt_id,v_attempt.expected_identity_id,v_attempt.expected_identity_version
  );
  v_identity_id := (v_receipt->>'identityId')::uuid;
  if (v_receipt->>'version')::integer <> 1 then
    raise exception 'SOCIAL_TIKTOK_NOT_AVAILABLE';
  end if;
  update public.social_account_oauth_attempts set status='verified',status_reason='verified',
    version=3,completed_at=v_now,result_identity_id=v_identity_id where id=p_attempt_id;
  insert into public.social_account_oauth_attempt_events(attempt_id,attempt_version,status,reason,occurred_at)
    values(p_attempt_id,3,'verified','verified',v_now);
  return v_receipt;
end;
$$;

alter table public.social_account_oauth_attempts owner to postgres;
alter table public.social_account_oauth_attempt_events owner to postgres;
alter table public.social_account_oauth_attempts enable row level security;
alter table public.social_account_oauth_attempt_events enable row level security;
revoke all on public.social_account_oauth_attempts, public.social_account_oauth_attempt_events
  from public, anon, authenticated, service_role, discord_bot;

do $$
declare v_signature text;
begin
  foreach v_signature in array array[
    'protect_social_account_oauth_attempt_history()',
    'start_tiktok_social_account_link(uuid,uuid,text)',
    'claim_tiktok_social_account_link(uuid,text)',
    'finish_tiktok_social_account_link(uuid,uuid,integer,text,text)',
    'complete_tiktok_social_account_link(uuid,uuid,integer,text,text,text)'
  ] loop
    execute 'alter function public.' || v_signature || ' owner to postgres';
    execute 'revoke all on function public.' || v_signature ||
      ' from public, anon, authenticated, service_role, discord_bot';
  end loop;
end;
$$;
grant execute on function
  public.start_tiktok_social_account_link(uuid,uuid,text),
  public.claim_tiktok_social_account_link(uuid,text),
  public.finish_tiktok_social_account_link(uuid,uuid,integer,text,text),
  public.complete_tiktok_social_account_link(uuid,uuid,integer,text,text,text)
to service_role;
