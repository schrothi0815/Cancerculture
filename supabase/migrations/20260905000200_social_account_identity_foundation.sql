-- Canonical ownership snapshots. No provider adapter or verification grant.
do $$
begin
  if to_regclass('public.social_account_linking_unlocks') is null
    or to_regprocedure('public.require_account_session(uuid)') is null
    or to_regclass('public.social_account_identities') is not null
    or to_regclass('public.social_account_identity_events') is not null then
    raise exception 'SOCIAL_IDENTITY_BASELINE_MISMATCH';
  end if;
end;
$$;

-- Deliberately conservative canonical locators, not ownership evidence.
create function public.social_account_public_url(p_provider text, p_locator text)
returns text language sql immutable security invoker
set search_path = public, pg_temp as $$
  select case
    when p_provider = 'youtube' and p_locator ~ '^UC[A-Za-z0-9_-]{22}$'
      then 'https://www.youtube.com/channel/' || p_locator
    when p_provider = 'tiktok' and p_locator ~ '^[A-Za-z0-9_][A-Za-z0-9_.]{0,63}$'
      then 'https://www.tiktok.com/@' || p_locator
    when p_provider = 'instagram' and p_locator ~ '^[A-Za-z0-9_][A-Za-z0-9_.]{0,63}$'
      and lower(p_locator) not in ('accounts','explore','direct','p','reel','reels','stories')
      then 'https://www.instagram.com/' || p_locator
    when p_provider = 'x' and p_locator ~ '^[A-Za-z0-9_]{1,15}$'
      and lower(p_locator) not in ('home','intent','i','search','explore','settings','messages','compose','login','signup','share')
      then 'https://x.com/' || p_locator
    when p_provider = 'facebook' and p_locator ~ '^[A-Za-z0-9][A-Za-z0-9.]{0,99}$'
      and lower(p_locator) not in ('dialog','login','logout','share','sharer','sharer.php','profile.php','watch','groups','pages','events','marketplace','gaming','help','settings','reel','reels','stories')
      then 'https://www.facebook.com/' || p_locator
    else null end;
$$;

create table public.social_account_identities (
  id uuid primary key default gen_random_uuid(),
  owner_discord_user_id text not null references public.user_logs(discord_user_id),
  provider text not null check (provider in ('tiktok','youtube','x','instagram','facebook')),
  provider_account_id text not null check (length(provider_account_id) between 1 and 256
    and provider_account_id = btrim(provider_account_id) and provider_account_id !~ '[[:cntrl:]]'),
  public_locator text not null,
  display_label text not null check (length(display_label) between 1 and 100 and length(btrim(display_label)) > 0 and display_label !~ '[[:cntrl:]]'),
  proof_reference uuid not null unique,
  generation integer not null check (generation > 0),
  verified_at timestamptz not null default clock_timestamp(),
  state text not null default 'active' check (state in ('active','disconnected','revoked')),
  version integer not null default 1,
  ended_at timestamptz,
  unique (owner_discord_user_id, provider, generation),
  check (public.social_account_public_url(provider, public_locator) is not null),
  check ((state = 'active' and version = 1 and ended_at is null)
    or (state in ('disconnected','revoked') and version = 2 and ended_at >= verified_at))
);
create unique index social_account_identity_active_owner_provider
  on public.social_account_identities(owner_discord_user_id, provider) where state = 'active';
create unique index social_account_identity_active_provider_subject
  on public.social_account_identities(provider, provider_account_id) where state = 'active';
create index social_account_identity_owner_history
  on public.social_account_identities(owner_discord_user_id, provider, generation desc);

-- The immutable snapshot above holds identity evidence; events record transitions
-- and exact request replay. Temporary OAuth/DM attempts are a separate later domain.
create table public.social_account_identity_events (
  request_id uuid primary key,
  identity_id uuid not null references public.social_account_identities(id),
  owner_discord_user_id text not null,
  event_type text not null check (event_type in ('verified','disconnected','revoked')),
  identity_version integer not null,
  request_payload jsonb not null check (jsonb_typeof(request_payload) = 'object'),
  occurred_at timestamptz not null default clock_timestamp(),
  unique (identity_id, identity_version),
  check ((event_type = 'verified' and identity_version = 1)
    or (event_type in ('disconnected','revoked') and identity_version = 2))
);

create function public.protect_social_account_identity_history()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if tg_table_name = 'social_account_identities' and tg_op = 'UPDATE' then
    if (to_jsonb(new) - array['state','version','ended_at'])
      is distinct from (to_jsonb(old) - array['state','version','ended_at'])
      or old.state <> 'active' or new.state not in ('disconnected','revoked')
      or new.version <> old.version + 1 or new.ended_at is null then
      raise exception 'SOCIAL_IDENTITY_HISTORY_IMMUTABLE';
    end if;
    return new;
  end if;
  raise exception 'SOCIAL_IDENTITY_HISTORY_IMMUTABLE';
end;
$$;
create trigger social_account_identity_history_guard before update or delete
  on public.social_account_identities for each row execute function public.protect_social_account_identity_history();
create trigger social_account_identity_truncate_guard before truncate
  on public.social_account_identities for each statement execute function public.protect_social_account_identity_history();
create trigger social_account_identity_events_guard before update or delete or truncate
  on public.social_account_identity_events for each statement execute function public.protect_social_account_identity_history();

-- Serialize every request, then owner/provider. Separate statements after lock
-- acquisition require READ COMMITTED so concurrent changes are observed.
create function public.lock_social_account_identity_request(p_request uuid, p_owner text, p_provider text)
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if current_setting('transaction_isolation') <> 'read committed' or p_request is null
    or p_owner is null or p_provider is null then
    raise exception 'SOCIAL_IDENTITY_REQUEST_INVALID';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('social-identity-request:' || p_request::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('social-identity-owner:' || p_owner || ':' || p_provider, 0));
end;
$$;

-- INTERNAL ONLY. A future reviewed adapter must validate actual provider proof,
-- owner-bound attempt, freshness, replay and current eligibility before calling.
-- No service/browser/Team role may call this helper or fabricate proof_reference.
create function public.record_social_account_identity(
  p_session_id uuid, p_request_id uuid, p_provider text, p_provider_account_id text,
  p_public_locator text, p_display_label text, p_proof_reference uuid,
  p_expected_identity_id uuid, p_expected_version integer
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_owner text; v_latest public.social_account_identities%rowtype;
  v_event public.social_account_identity_events%rowtype; v_payload jsonb; v_id uuid;
begin
  v_owner := public.require_account_session(p_session_id);
  perform public.lock_social_account_identity_request(p_request_id, v_owner, p_provider);
  perform public.require_account_session(p_session_id);
  if not exists(select 1 from public.social_account_linking_unlocks where owner_discord_user_id = v_owner) then
    raise exception 'SOCIAL_IDENTITY_NOT_AVAILABLE';
  end if;
  v_payload := jsonb_build_object('provider',p_provider,'subject',p_provider_account_id,
    'locator',p_public_locator,'label',p_display_label,'proof',p_proof_reference,
    'expectedId',p_expected_identity_id,'expectedVersion',p_expected_version);
  select * into v_event from public.social_account_identity_events where request_id = p_request_id;
  if found then
    if v_event.owner_discord_user_id <> v_owner or v_event.event_type <> 'verified'
      or v_event.request_payload <> v_payload then raise exception 'SOCIAL_IDENTITY_REQUEST_INVALID'; end if;
    return jsonb_build_object('identityId',v_event.identity_id,'version',v_event.identity_version);
  end if;
  select * into v_latest from public.social_account_identities
    where owner_discord_user_id = v_owner and provider = p_provider order by generation desc limit 1;
  if v_latest.id is distinct from p_expected_identity_id
    or coalesce(v_latest.version,0) is distinct from p_expected_version
    or v_latest.state = 'active' then raise exception 'SOCIAL_IDENTITY_NOT_AVAILABLE'; end if;
  if p_provider_account_id is null or p_proof_reference is null
    or public.social_account_public_url(p_provider,p_public_locator) is null then
    raise exception 'SOCIAL_IDENTITY_NOT_AVAILABLE';
  end if;
  -- Index is the final global uniqueness boundary, including other owners.
  insert into public.social_account_identities(owner_discord_user_id,provider,provider_account_id,
    public_locator,display_label,proof_reference,generation)
    values(v_owner,p_provider,p_provider_account_id,p_public_locator,p_display_label,p_proof_reference,coalesce(v_latest.generation,0)+1) returning id into v_id;
  insert into public.social_account_identity_events(request_id,identity_id,owner_discord_user_id,event_type,identity_version,request_payload)
    values(p_request_id,v_id,v_owner,'verified',1,v_payload);
  return jsonb_build_object('identityId',v_id,'version',1);
exception when unique_violation or check_violation or not_null_violation or foreign_key_violation then
  raise exception using errcode = 'P0001', message = 'SOCIAL_IDENTITY_NOT_AVAILABLE';
end;
$$;

create function public.end_social_account_identity(
  p_owner text, p_identity_id uuid, p_expected_version integer, p_request_id uuid, p_action text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_identity public.social_account_identities%rowtype;
  v_event public.social_account_identity_events%rowtype; v_payload jsonb;
begin
  select * into v_identity from public.social_account_identities where id = p_identity_id and owner_discord_user_id = p_owner;
  if not found or p_action is null or p_action not in ('disconnected','revoked') then
    raise exception 'SOCIAL_IDENTITY_NOT_AVAILABLE';
  end if;
  perform public.lock_social_account_identity_request(p_request_id,p_owner,v_identity.provider);
  v_payload := jsonb_build_object('identityId',p_identity_id,'expectedVersion',p_expected_version);
  select * into v_event from public.social_account_identity_events where request_id = p_request_id;
  if found then
    if v_event.owner_discord_user_id <> p_owner or v_event.event_type <> p_action
      or v_event.request_payload <> v_payload then raise exception 'SOCIAL_IDENTITY_REQUEST_INVALID'; end if;
    return jsonb_build_object('identityId',v_event.identity_id,'version',v_event.identity_version);
  end if;
  update public.social_account_identities set state = p_action, version = version + 1, ended_at = clock_timestamp()
    where id = p_identity_id and owner_discord_user_id = p_owner and state = 'active' and version = p_expected_version
    returning * into v_identity;
  if not found then raise exception 'SOCIAL_IDENTITY_NOT_AVAILABLE'; end if;
  insert into public.social_account_identity_events(request_id,identity_id,owner_discord_user_id,event_type,identity_version,request_payload)
    values(p_request_id,p_identity_id,p_owner,p_action,v_identity.version,v_payload);
  return jsonb_build_object('identityId',p_identity_id,'version',v_identity.version);
end;
$$;

create function public.disconnect_own_social_account_identity(
  p_session_id uuid, p_identity_id uuid, p_expected_version integer, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_owner text;
begin
  v_owner := public.require_account_session(p_session_id);
  return public.end_social_account_identity(v_owner,p_identity_id,p_expected_version,p_request_id,'disconnected');
end;
$$;

create function public.get_own_social_account_identities(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_owner text; v_links jsonb;
begin
  v_owner := public.require_account_session(p_session_id);
  select coalesce(jsonb_agg(jsonb_build_object('identityId',i.id,'provider',i.provider,
    'displayLabel',i.display_label,'url',public.social_account_public_url(i.provider,i.public_locator),
    'version',i.version,'state',i.state,'verifiedAt',i.verified_at,'endedAt',i.ended_at) order by i.provider),'[]'::jsonb)
    into v_links from (select distinct on (provider) * from public.social_account_identities
      where owner_discord_user_id = v_owner order by provider,generation desc) i;
  return v_links;
end;
$$;

-- Backend projection only: consumer must resolve its public owner and use its
-- fixed surface. No legacy URL/snapshot is consulted; no caching is introduced.
create function public.get_public_social_account_identities(p_public_profile_id uuid, p_surface text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_links jsonb;
begin
  if p_surface is null or p_surface not in ('profile','submission') then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object('provider',i.provider,'displayLabel',i.display_label,
    'url',public.social_account_public_url(i.provider,i.public_locator)) order by i.provider),'[]'::jsonb)
    into v_links from public.social_account_identities i
    join public.user_logs u on u.discord_user_id = i.owner_discord_user_id
    where u.public_profile_id = p_public_profile_id and i.state = 'active'
      and case when p_surface = 'profile' then u.show_socials else u.show_socials_on_submissions end;
  return v_links;
end;
$$;

alter table public.social_account_identities owner to postgres;
alter table public.social_account_identity_events owner to postgres;
alter table public.social_account_identities enable row level security;
alter table public.social_account_identity_events enable row level security;
revoke all on public.social_account_identities, public.social_account_identity_events
  from public, anon, authenticated, service_role, discord_bot;

-- Explicitly close default/inherited grants for every exact new signature.
do $$
declare v_signature text;
begin
  foreach v_signature in array array[
    'social_account_public_url(text,text)',
    'protect_social_account_identity_history()',
    'lock_social_account_identity_request(uuid,text,text)',
    'record_social_account_identity(uuid,uuid,text,text,text,text,uuid,uuid,integer)',
    'end_social_account_identity(text,uuid,integer,uuid,text)',
    'disconnect_own_social_account_identity(uuid,uuid,integer,uuid)',
    'get_own_social_account_identities(uuid)',
    'get_public_social_account_identities(uuid,text)'
  ] loop
    execute 'alter function public.' || v_signature || ' owner to postgres';
    execute 'revoke all on function public.' || v_signature || ' from public, anon, authenticated, service_role, discord_bot';
  end loop;
end;
$$;
grant execute on function public.disconnect_own_social_account_identity(uuid,uuid,integer,uuid),
  public.get_own_social_account_identities(uuid), public.get_public_social_account_identities(uuid,text) to service_role;
