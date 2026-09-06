-- Only for the disposable local PostgreSQL harness. Never apply to DEV/LIVE.
-- These are dependency doubles; real finalizer integration needs separate DEV validation.
create role anon;
create role authenticated;
create role discord_bot;
create role service_role;
create table public.user_logs (discord_user_id text primary key, is_banned boolean not null default false);
create table public.sessions (id uuid primary key, discord_user_id text not null, revoked_at timestamptz);
create table public.discord_member_state (discord_user_id text primary key, discord_ban_active boolean);
create table public.voting_cycles (id bigint primary key, status text not null, finalized_at timestamptz);
create table public.submissions (
  id bigint primary key, cycle_id bigint, discord_user_id text not null,
  is_disqualified boolean not null default false, vote_count integer not null default 0
);
create table public.cycle_results (
  id bigint generated always as identity primary key,
  cycle_id bigint not null, submission_id bigint not null,
  finalized_at timestamptz not null, is_disqualified_at_finalization boolean not null,
  unique (cycle_id, submission_id)
);
create table public.user_social_links (id bigint);
create table public.submission_social_links (id bigint);
create table public.social_verification_logs (id bigint);
create table public.notification_category_catalog (
  category_key text primary key, display_name text not null,
  required_in_product boolean not null, is_active boolean not null,
  description text, default_in_product_enabled boolean not null,
  in_product_available boolean not null, push_available boolean not null
);
create table public.notification_events (
  id uuid primary key default gen_random_uuid(), producer_key text not null unique,
  event_type text not null, category_key text not null references public.notification_category_catalog,
  audience_type text not null, owner_discord_user_id text, deep_link text not null,
  occurred_at timestamptz not null default transaction_timestamp(),
  created_at timestamptz not null default transaction_timestamp(), public_body text,
  constraint notification_event_type_check check (true),
  constraint notification_event_category_check check (true)
);
create table public.account_notifications (
  id uuid primary key default gen_random_uuid(), event_id uuid not null references public.notification_events,
  owner_discord_user_id text not null, visible_in_product boolean not null,
  read_at timestamptz, created_at timestamptz not null default transaction_timestamp(),
  unique (event_id, owner_discord_user_id)
);
create table public.push_delivery_jobs (id bigint);

create function public.require_account_session(p_session_id uuid)
returns text language plpgsql security definer set search_path = public, pg_temp
as $function$
declare v_discord_user_id text;
begin
  select s.discord_user_id into v_discord_user_id
  from public.sessions s join public.user_logs u on u.discord_user_id = s.discord_user_id
  left join public.discord_member_state d on d.discord_user_id = s.discord_user_id
  where s.id = p_session_id and s.revoked_at is null and not u.is_banned
    and not coalesce(d.discord_ban_active, false)
  for update of s;
  if not found then raise exception using errcode = '28000', message = 'ACCOUNT_SESSION_INVALID'; end if;
  return v_discord_user_id;
end;
$function$;

create function public.get_own_notifications(
  p_session_id uuid, p_before_created_at timestamptz default null,
  p_before_id uuid default null, p_limit integer default 20
) returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $function$ begin return '{}'::jsonb; end; $function$;

create function public.finalize_cycle(p_cycle_id bigint, p_actor_discord_user_id text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $function$
declare v_cycle public.voting_cycles%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('cycle-finalization:' || p_cycle_id, 0));
  select * into strict v_cycle from public.voting_cycles where id = p_cycle_id for update;
  if p_actor_discord_user_id = 'delay' then perform pg_sleep(0.35); end if;
  if v_cycle.status = 'finished' then
    return jsonb_build_object('alreadyFinalized', true, 'preserved', 'base receipt');
  end if;
  insert into public.cycle_results (cycle_id, submission_id, finalized_at, is_disqualified_at_finalization)
  select p_cycle_id, id, transaction_timestamp(), false from public.submissions
  where cycle_id = p_cycle_id and not is_disqualified;
  if not found then raise exception using message = 'NO_ELIGIBLE_SUBMISSIONS'; end if;
  update public.voting_cycles set status = 'finished', finalized_at = transaction_timestamp() where id = p_cycle_id;
  if p_actor_discord_user_id = 'fail_base' then raise exception using message = 'BASE_FINALIZER_FAILED'; end if;
  return jsonb_build_object('alreadyFinalized', false, 'preserved', 'base receipt');
end;
$function$;

revoke all on function public.finalize_cycle(bigint,text), public.require_account_session(uuid)
from public, anon, authenticated, discord_bot, service_role;
