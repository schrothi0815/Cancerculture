-- Own management only. Provider verification remains postgres-internal.
alter table public.user_logs add column social_visibility_version integer not null default 0
  check (social_visibility_version >= 0);

create table public.social_account_visibility_events (
  request_id uuid primary key,
  owner_discord_user_id text not null references public.user_logs(discord_user_id),
  scope text not null check (scope in ('profile','submissions')),
  value boolean not null,
  expected_version integer not null check (expected_version >= 0),
  resulting_version integer not null check (resulting_version = expected_version + 1),
  created_at timestamptz not null default clock_timestamp(),
  unique(owner_discord_user_id,resulting_version)
);
alter table public.social_account_visibility_events owner to postgres;
alter table public.social_account_visibility_events enable row level security;
revoke all on public.social_account_visibility_events from public, anon, authenticated, service_role, discord_bot;
create trigger social_account_visibility_events_guard before update or delete or truncate
  on public.social_account_visibility_events for each statement execute function public.protect_social_account_identity_history();

-- The invoker is the outer hardened RPC owner. Direct application DML cannot
-- bypass the RPC. Existing postgres-only maintenance/reset flows remain valid
-- and advance the version when preferences change, invalidating stale views.
create function public.protect_social_account_visibility()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    if current_user <> 'postgres' and (new.show_socials or new.show_socials_on_submissions or new.social_visibility_version <> 0) then
      raise exception 'SOCIAL_VISIBILITY_NOT_AVAILABLE';
    end if;
  elsif new.show_socials is distinct from old.show_socials
    or new.show_socials_on_submissions is distinct from old.show_socials_on_submissions
    or new.social_visibility_version is distinct from old.social_visibility_version then
    if current_user <> 'postgres' then raise exception 'SOCIAL_VISIBILITY_NOT_AVAILABLE'; end if;
    new.social_visibility_version := old.social_visibility_version + 1;
  end if;
  return new;
end;
$$;
create trigger social_account_visibility_guard before insert or update on public.user_logs
  for each row execute function public.protect_social_account_visibility();

-- Session -> request -> shared owner -> provider -> rows. Every lifecycle writer
-- already uses this helper, so disconnect/revoke/reconnect serialize with opt-in.
create or replace function public.lock_social_account_identity_request(p_request uuid, p_owner text, p_provider text)
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if current_setting('transaction_isolation') <> 'read committed' or p_request is null
    or p_owner is null or p_provider is null then raise exception 'SOCIAL_IDENTITY_REQUEST_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended('social-identity-request:' || p_request::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('social-management-owner:' || p_owner, 0));
  perform pg_advisory_xact_lock(hashtextextended('social-identity-owner:' || p_owner || ':' || p_provider, 0));
end;
$$;

create or replace function public.disconnect_own_social_account_identity(
  p_session_id uuid, p_identity_id uuid, p_expected_version integer, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_owner text; v_provider text;
begin
  v_owner := public.require_account_session(p_session_id);
  select provider into v_provider from public.social_account_identities
    where id = p_identity_id and owner_discord_user_id = v_owner;
  if not found or p_expected_version is distinct from 1 then raise exception 'SOCIAL_IDENTITY_NOT_AVAILABLE'; end if;
  perform public.lock_social_account_identity_request(p_request_id,v_owner,v_provider);
  perform public.require_account_session(p_session_id);
  return public.end_social_account_identity(v_owner,p_identity_id,p_expected_version,p_request_id,'disconnected');
end;
$$;

create function public.get_own_social_account_visibility(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_owner text; v_result jsonb;
begin
  v_owner := public.require_account_session(p_session_id);
  select jsonb_build_object('profile',u.show_socials,'submissions',u.show_socials_on_submissions,
    'version',u.social_visibility_version,'canEnable',
      exists(select 1 from public.social_account_linking_unlocks where owner_discord_user_id = v_owner)
      and exists(select 1 from public.social_account_identities where owner_discord_user_id = v_owner and state = 'active'))
    into v_result from public.user_logs u where u.discord_user_id = v_owner;
  return v_result;
end;
$$;

create function public.set_own_social_account_visibility(
  p_session_id uuid, p_scope text, p_value boolean, p_expected_version integer, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_owner text; v_authenticated_owner text; v_event public.social_account_visibility_events%rowtype; v_version integer;
begin
  -- Ban/revocation locks the user before sessions. Resolve only a candidate
  -- owner, acquire the compatible non-key user lock, then authenticate fully.
  select discord_user_id into v_owner from public.sessions where id = p_session_id;
  if v_owner is null then raise exception using errcode = '28000', message = 'ACCOUNT_SESSION_INVALID'; end if;
  perform 1 from public.user_logs where discord_user_id = v_owner for no key update;
  v_authenticated_owner := public.require_account_session(p_session_id);
  if v_authenticated_owner is distinct from v_owner then raise exception using errcode = '28000', message = 'ACCOUNT_SESSION_INVALID'; end if;
  if p_scope is null or p_scope not in ('profile','submissions') or p_value is null
    or p_expected_version is null or p_expected_version < 0 or p_expected_version = 2147483647 then
    raise exception 'SOCIAL_VISIBILITY_REQUEST_INVALID';
  end if;
  perform public.lock_social_account_identity_request(p_request_id,v_owner,'visibility');
  perform public.require_account_session(p_session_id);
  select * into v_event from public.social_account_visibility_events where request_id = p_request_id;
  if found then
    if v_event.owner_discord_user_id <> v_owner or v_event.scope <> p_scope or v_event.value <> p_value
      or v_event.expected_version <> p_expected_version then raise exception 'SOCIAL_VISIBILITY_REQUEST_INVALID'; end if;
    -- Historical receipt only. The caller must reload current state afterwards.
    return jsonb_build_object('version',v_event.resulting_version);
  end if;
  if p_value and (not exists(select 1 from public.social_account_linking_unlocks where owner_discord_user_id = v_owner)
    or not exists(select 1 from public.social_account_identities where owner_discord_user_id = v_owner and state = 'active')) then
    raise exception 'SOCIAL_VISIBILITY_NOT_AVAILABLE';
  end if;
  update public.user_logs set
    show_socials = case when p_scope = 'profile' then p_value else show_socials end,
    show_socials_on_submissions = case when p_scope = 'submissions' then p_value else show_socials_on_submissions end,
    social_visibility_version = social_visibility_version + 1
    where discord_user_id = v_owner and social_visibility_version = p_expected_version
    returning social_visibility_version into v_version;
  if not found then raise exception 'SOCIAL_VISIBILITY_NOT_AVAILABLE'; end if;
  insert into public.social_account_visibility_events(request_id,owner_discord_user_id,scope,value,expected_version,resulting_version)
    values(p_request_id,v_owner,p_scope,p_value,p_expected_version,v_version);
  return jsonb_build_object('version',v_version);
end;
$$;

do $$
declare v_signature text;
begin
  foreach v_signature in array array['protect_social_account_visibility()',
    'lock_social_account_identity_request(uuid,text,text)',
    'disconnect_own_social_account_identity(uuid,uuid,integer,uuid)',
    'get_own_social_account_visibility(uuid)',
    'set_own_social_account_visibility(uuid,text,boolean,integer,uuid)'] loop
    execute 'alter function public.' || v_signature || ' owner to postgres';
    execute 'revoke all on function public.' || v_signature || ' from public, anon, authenticated, service_role, discord_bot';
  end loop;
end;
$$;
grant execute on function public.disconnect_own_social_account_identity(uuid,uuid,integer,uuid),
  public.get_own_social_account_visibility(uuid), public.set_own_social_account_visibility(uuid,text,boolean,integer,uuid) to service_role;
