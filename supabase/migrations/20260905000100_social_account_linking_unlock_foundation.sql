-- The caller owns the transaction. This migration does not run a backfill.
do $preflight$
begin
  if to_regclass('public.social_account_qualifying_cycles') is not null
    or to_regclass('public.social_account_linking_unlocks') is not null
    or to_regprocedure('public.finalize_cycle_without_social_linking(bigint,text)') is not null
    or to_regprocedure('public.finalize_cycle(bigint,text)') is null
    or to_regprocedure('public.require_account_session(uuid)') is null
    or to_regprocedure('public.get_own_notifications(uuid,timestamptz,uuid,integer)') is null
    or to_regclass('public.cycle_results') is null
    or to_regclass('public.notification_events') is null
    or not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'cycle_results'
        and column_name = 'is_disqualified_at_finalization' and is_nullable = 'NO'
    )
    or exists (select 1 from public.notification_category_catalog where category_key = 'social_account_linking')
  then
    raise exception using errcode = '55000', message = 'SOCIAL_LINKING_BASELINE_MISMATCH';
  end if;
  if exists (select 1 from public.user_social_links)
    or exists (select 1 from public.submission_social_links)
    or exists (select 1 from public.social_verification_logs)
  then
    raise exception using errcode = '55000', message = 'SOCIAL_LINKING_LEGACY_DATA_REVIEW_REQUIRED';
  end if;
end;
$preflight$;

-- Source identifiers are frozen evidence, deliberately not source-row FKs.
-- A source FK would acquire key-share locks after the owner lock and invert
-- the existing finalizer's cycle -> owner lock order during backfill/replay.
create table public.social_account_qualifying_cycles (
  owner_discord_user_id text not null check (char_length(owner_discord_user_id) between 1 and 100),
  cycle_id bigint not null check (cycle_id > 0),
  source_submission_id bigint not null check (source_submission_id > 0),
  source_result_id bigint not null check (source_result_id > 0),
  finalized_at timestamptz not null,
  recorded_at timestamptz not null default clock_timestamp(),
  primary key (owner_discord_user_id, cycle_id)
);
create index social_account_qualifying_cycles_owner_order_idx
  on public.social_account_qualifying_cycles (owner_discord_user_id, finalized_at, cycle_id);

create table public.social_account_linking_unlocks (
  owner_discord_user_id text primary key,
  fifth_cycle_id bigint not null,
  unlocked_at timestamptz not null,
  source text not null check (source in ('finalization', 'historical_backfill')),
  notification_event_id uuid not null unique references public.notification_events(id) on delete restrict,
  foreign key (owner_discord_user_id, fifth_cycle_id)
    references public.social_account_qualifying_cycles(owner_discord_user_id, cycle_id) on delete restrict
);

create function public.protect_social_account_linking_evidence()
returns trigger language plpgsql set search_path = public, pg_temp
as $function$
begin
  raise exception using errcode = '55000', message = 'SOCIAL_LINKING_EVIDENCE_IS_IMMUTABLE';
end;
$function$;
create trigger social_account_qualifying_cycles_immutable
before update or delete on public.social_account_qualifying_cycles
for each row execute function public.protect_social_account_linking_evidence();
create trigger social_account_linking_unlocks_immutable
before update or delete on public.social_account_linking_unlocks
for each row execute function public.protect_social_account_linking_evidence();

insert into public.notification_category_catalog (
  category_key, display_name, required_in_product, is_active, description,
  default_in_product_enabled, in_product_available, push_available
) values (
  'social_account_linking', 'Social account linking', true, true,
  'A one-time private notice when social account linking becomes available.',
  true, false, false
);

-- This internal writer runs only after the complete finalizer, or through the
-- bounded owner-only backfill. It never calls the optional Push producer.
create function public.record_social_account_linking_progress(p_owner text, p_source text)
returns boolean language plpgsql volatile security definer
set search_path = public, pg_temp
as $function$
declare
  v_fifth_cycle bigint;
  v_event_id uuid;
  v_now timestamptz;
begin
  if p_owner is null or char_length(p_owner) not between 1 and 100
    or p_source is null or p_source not in ('finalization', 'historical_backfill')
  then raise exception using errcode = '22023', message = 'SOCIAL_LINKING_INPUT_INVALID'; end if;
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception using errcode = '25000', message = 'SOCIAL_LINKING_REQUIRES_READ_COMMITTED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('social-account-linking:' || p_owner, 0));
  -- A separate statement AFTER waiting for the lock obtains a fresh snapshot.
  if not exists (select 1 from public.user_logs where discord_user_id = p_owner)
    or exists (
      select 1 from public.cycle_results r
      join public.submissions s on s.id = r.submission_id
      left join public.voting_cycles c on c.id = r.cycle_id
      where s.discord_user_id = p_owner and (
        c.id is null or c.status <> 'finished' or c.finalized_at is null
        or r.finalized_at is null or r.finalized_at <> c.finalized_at
        or r.is_disqualified_at_finalization is null or s.cycle_id is distinct from r.cycle_id
      )
    )
  then raise exception using errcode = '55000', message = 'SOCIAL_LINKING_EVIDENCE_INVALID'; end if;

  insert into public.social_account_qualifying_cycles (
    owner_discord_user_id, cycle_id, source_submission_id, source_result_id, finalized_at
  )
  select distinct on (r.cycle_id)
    p_owner, r.cycle_id, s.id, r.id, r.finalized_at
  from public.cycle_results r
  join public.submissions s on s.id = r.submission_id and s.cycle_id = r.cycle_id
  join public.voting_cycles c on c.id = r.cycle_id
  where s.discord_user_id = p_owner and c.status = 'finished'
    and c.finalized_at is not null and r.finalized_at is not null
    and r.is_disqualified_at_finalization = false
  order by r.cycle_id, s.id, r.id
  on conflict (owner_discord_user_id, cycle_id) do nothing;

  if exists (select 1 from public.social_account_linking_unlocks where owner_discord_user_id = p_owner) then
    return false;
  end if;
  select cycle_id into v_fifth_cycle
  from public.social_account_qualifying_cycles
  where owner_discord_user_id = p_owner
  order by finalized_at, cycle_id offset 4 limit 1;
  if not found then return false; end if;

  v_now := clock_timestamp();
  -- The key represents one lifetime unlock, regardless of the triggering cycle.
  -- A pre-existing event without its atomic unlock is inconsistent, not repair.
  insert into public.notification_events (
    producer_key, event_type, category_key, audience_type,
    owner_discord_user_id, deep_link, occurred_at, created_at
  ) values (
    'social_account_linking_unlocked:' || p_owner,
    'social_account_linking_unlocked', 'social_account_linking', 'account',
    p_owner, '/settings/profile', v_now, v_now
  ) returning id into v_event_id;
  insert into public.account_notifications (
    event_id, owner_discord_user_id, visible_in_product, created_at
  ) values (v_event_id, p_owner, true, v_now);
  insert into public.social_account_linking_unlocks (
    owner_discord_user_id, fifth_cycle_id, unlocked_at, source, notification_event_id
  ) values (p_owner, v_fifth_cycle, v_now, p_source, v_event_id);
  return true;
end;
$function$;

alter function public.finalize_cycle(bigint,text) rename to finalize_cycle_without_social_linking;
create function public.finalize_cycle(p_cycle_id bigint, p_actor_discord_user_id text)
returns jsonb language plpgsql volatile security definer
set search_path = public, pg_temp
as $function$
declare
  v_result jsonb;
  v_owner text;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception using errcode = '25000', message = 'SOCIAL_LINKING_REQUIRES_READ_COMMITTED';
  end if;
  v_result := public.finalize_cycle_without_social_linking(p_cycle_id, p_actor_discord_user_id);
  if not exists (
    select 1 from public.voting_cycles where id = p_cycle_id
      and status = 'finished' and finalized_at is not null
  ) or exists (
    select 1 from public.cycle_results r
    left join public.submissions s on s.id = r.submission_id
    left join public.user_logs u on u.discord_user_id = s.discord_user_id
    where r.cycle_id = p_cycle_id and (s.id is null or u.discord_user_id is null)
  ) then raise exception using errcode = '55000', message = 'SOCIAL_LINKING_EVIDENCE_INVALID'; end if;

  for v_owner in
    select distinct s.discord_user_id collate "C"
    from public.cycle_results r join public.submissions s on s.id = r.submission_id
    where r.cycle_id = p_cycle_id
    order by s.discord_user_id collate "C"
  loop
    perform public.record_social_account_linking_progress(v_owner, 'finalization');
  end loop;
  return v_result;
end;
$function$;

create function public.backfill_social_account_linking(p_after_owner text default null, p_limit integer default 100)
returns jsonb language plpgsql volatile security definer
set search_path = public, pg_temp
as $function$
declare
  v_owner text;
  v_last_owner text := p_after_owner;
  v_processed integer := 0;
  v_unlocked integer := 0;
  v_has_more boolean := false;
begin
  if p_limit is null or p_limit not between 1 and 100
    or (p_after_owner is not null and char_length(p_after_owner) not between 1 and 100)
  then raise exception using errcode = '22023', message = 'SOCIAL_LINKING_INPUT_INVALID'; end if;
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception using errcode = '25000', message = 'SOCIAL_LINKING_REQUIRES_READ_COMMITTED';
  end if;
  if exists (
    select 1 from public.cycle_results r
    left join public.submissions s on s.id = r.submission_id
    left join public.voting_cycles c on c.id = r.cycle_id
    left join public.user_logs u on u.discord_user_id = s.discord_user_id
    where s.id is null or c.id is null or u.discord_user_id is null
      or c.status <> 'finished' or c.finalized_at is null or r.finalized_at is null
      or r.finalized_at <> c.finalized_at or s.cycle_id is distinct from r.cycle_id
  ) then raise exception using errcode = '55000', message = 'SOCIAL_LINKING_EVIDENCE_INVALID'; end if;

  for v_owner in
    select distinct s.discord_user_id collate "C"
    from public.cycle_results r join public.submissions s on s.id = r.submission_id
    where (p_after_owner is null or s.discord_user_id collate "C" > p_after_owner collate "C")
    order by s.discord_user_id collate "C" limit p_limit + 1
  loop
    if v_processed = p_limit then v_has_more := true; exit; end if;
    if public.record_social_account_linking_progress(v_owner, 'historical_backfill') then
      v_unlocked := v_unlocked + 1;
    end if;
    v_processed := v_processed + 1;
    v_last_owner := v_owner;
  end loop;
  return jsonb_build_object('processedOwners', v_processed, 'newUnlocks', v_unlocked,
    'hasMore', v_has_more, 'nextOwner', case when v_has_more then v_last_owner else null end);
end;
$function$;

create function public.get_own_social_account_linking_status(p_session_id uuid)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $function$
declare
  v_owner text;
  v_count integer;
  v_unlocked_at timestamptz;
begin
  v_owner := public.require_account_session(p_session_id);
  select unlocked_at into v_unlocked_at from public.social_account_linking_unlocks
  where owner_discord_user_id = v_owner;
  select least(count(*), 5)::integer into v_count from (
    select cycle_id from public.social_account_qualifying_cycles where owner_discord_user_id = v_owner
    union
    select r.cycle_id from public.cycle_results r
    join public.submissions s on s.id = r.submission_id and s.cycle_id = r.cycle_id
    join public.voting_cycles c on c.id = r.cycle_id
    where s.discord_user_id = v_owner and c.status = 'finished'
      and c.finalized_at is not null and r.finalized_at = c.finalized_at
      and r.is_disqualified_at_finalization = false
  ) qualifying;
  return jsonb_build_object('eligibleCycles', case when v_unlocked_at is not null then 5 else v_count end,
    'requiredCycles', 5, 'unlocked', v_unlocked_at is not null, 'unlockedAt', v_unlocked_at);
end;
$function$;

alter table public.social_account_qualifying_cycles owner to postgres;
alter table public.social_account_linking_unlocks owner to postgres;
alter table public.social_account_qualifying_cycles enable row level security;
alter table public.social_account_linking_unlocks enable row level security;
revoke all on table public.social_account_qualifying_cycles, public.social_account_linking_unlocks
  from public, anon, authenticated, discord_bot, service_role;
alter function public.protect_social_account_linking_evidence() owner to postgres;
alter function public.record_social_account_linking_progress(text,text) owner to postgres;
alter function public.finalize_cycle_without_social_linking(bigint,text) owner to postgres;
alter function public.finalize_cycle(bigint,text) owner to postgres;
alter function public.backfill_social_account_linking(text,integer) owner to postgres;
alter function public.get_own_social_account_linking_status(uuid) owner to postgres;
revoke all on function public.protect_social_account_linking_evidence(),
  public.record_social_account_linking_progress(text,text),
  public.finalize_cycle_without_social_linking(bigint,text), public.finalize_cycle(bigint,text),
  public.backfill_social_account_linking(text,integer), public.get_own_social_account_linking_status(uuid)
  from public, anon, authenticated, discord_bot, service_role;
grant execute on function public.get_own_social_account_linking_status(uuid) to service_role;

alter table public.notification_events
  drop constraint notification_event_type_check,
  drop constraint notification_event_category_check;
alter table public.notification_events
  add constraint notification_event_type_check check (event_type in (
    'winner_claim_required', 'winner_correction_ready', 'winner_donation_finalized',
    'winner_payout_sent', 'donation_recipient_change_required',
    'submission_disqualified', 'submission_reinstated',
    'cycle_started', 'cycle_submission_ending_15m', 'cycle_submission_ending_10m',
    'cycle_submission_ending_5m', 'cycle_submission_ended',
    'cycle_voting_ending_15m', 'cycle_voting_ending_10m',
    'cycle_voting_ending_5m', 'cycle_voting_ended', 'cycle_results_ready',
    'community_vote_announced',
    'wallet_issue_received', 'wallet_issue_correction_ready', 'wallet_issue_resolved',
    'comment_reply', 'comment_mention',
    'user_warning_issued', 'user_warning_overruled', 'user_warning_appeal_upheld',
    'social_account_linking_unlocked'
  )),
  add constraint notification_event_category_check check (
    (event_type in ('winner_claim_required', 'winner_correction_ready', 'winner_donation_finalized',
      'winner_payout_sent', 'donation_recipient_change_required') and category_key = 'winners_claims')
    or (event_type in ('submission_disqualified', 'submission_reinstated') and category_key = 'submission_moderation')
    or (event_type in ('cycle_started', 'cycle_submission_ending_15m', 'cycle_submission_ending_10m',
      'cycle_submission_ending_5m', 'cycle_submission_ended', 'cycle_voting_ending_15m',
      'cycle_voting_ending_10m', 'cycle_voting_ending_5m', 'cycle_voting_ended',
      'cycle_results_ready') and category_key = 'cycles_voting')
    or (event_type = 'community_vote_announced' and category_key = 'community_votes')
    or (event_type in ('wallet_issue_received', 'wallet_issue_correction_ready', 'wallet_issue_resolved') and category_key = 'wallet_issues')
    or (event_type = 'comment_reply' and category_key = 'comment_replies')
    or (event_type = 'comment_mention' and category_key = 'comment_mentions')
    or (event_type in ('user_warning_issued', 'user_warning_overruled', 'user_warning_appeal_upheld') and category_key = 'account_warnings')
    or (event_type = 'social_account_linking_unlocked' and category_key = 'social_account_linking')
  );

create or replace function public.get_own_notifications(
  p_session_id uuid,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_owner_id text;
  v_items jsonb;
begin
  if p_limit not between 1 and 50
    or ((p_before_created_at is null) <> (p_before_id is null))
  then raise exception using errcode = '22023', message = 'NOTIFICATION_PAGE_INPUT_INVALID'; end if;
  v_owner_id := public.require_account_session(p_session_id);
  select coalesce(jsonb_agg(item.payload order by item.created_at desc, item.id desc), '[]'::jsonb)
  into v_items
  from (
    select notification.created_at, notification.id,
      jsonb_build_object(
        'id', notification.id, 'categoryKey', event.category_key,
        'eventType', event.event_type,
        'title', case event.event_type
          when 'winner_claim_required' then 'Winner claim required'
          when 'winner_correction_ready' then 'Winner claim ready'
          when 'winner_donation_finalized' then 'Winner result finalized'
          when 'winner_payout_sent' then 'Prize sent'
          when 'donation_recipient_change_required' then 'Choose another charity'
          when 'submission_disqualified' then 'Submission disqualified'
          when 'submission_reinstated' then 'Submission restored'
          when 'wallet_issue_received' then 'Wallet issue received'
          when 'wallet_issue_correction_ready' then 'Wallet correction ready'
          when 'wallet_issue_resolved' then 'Wallet issue resolved'
          when 'comment_reply' then 'New comment reply'
          when 'comment_mention' then 'New comment mention'
          when 'user_warning_issued' then 'Account Warning'
          when 'user_warning_overruled' then 'Account Warning withdrawn'
          when 'user_warning_appeal_upheld' then 'Warning appeal reviewed'
          when 'social_account_linking_unlocked' then 'Social account linking unlocked'
          else 'Cycle results are ready' end,
        'body', coalesce(event.public_body, case event.event_type
          when 'winner_claim_required' then 'Review and confirm your winner claim.'
          when 'winner_correction_ready' then 'Review the full recipient and confirm your Claim within 24 hours.'
          when 'winner_donation_finalized' then 'View your finalized winner result.'
          when 'winner_payout_sent' then 'Your prize payout has been recorded as sent.'
          when 'submission_disqualified' then 'View your moderation history for details.'
          when 'submission_reinstated' then 'View your moderation history for details.'
          when 'wallet_issue_received' then 'Your winning-Submission report is ready for Team review.'
          when 'wallet_issue_correction_ready' then 'Review the full recipient and confirm your Claim within 24 hours.'
          when 'wallet_issue_resolved' then 'Review the current recipient and confirm your Claim within 24 hours.'
          when 'comment_reply' then 'You have a new reply.'
          when 'comment_mention' then 'You were mentioned.'
          when 'user_warning_issued' then 'Review a Warning issued by the CancerCulture Team.'
          when 'user_warning_overruled' then 'A Warning for your account was withdrawn. Review your updated account Warning status.'
          when 'user_warning_appeal_upheld' then 'CancerCulture Team reviewed your Warning appeal. Open CancerCulture to view the outcome.'
          when 'social_account_linking_unlocked' then 'You completed 5 eligible Cycles. You can now link a social media account to your CancerCulture profile.'
          else 'View the finalized Cycle results.' end),
        'actionLabel', case event.event_type
          when 'winner_claim_required' then 'Review claim'
          when 'winner_correction_ready' then 'Review claim'
          when 'winner_donation_finalized' then 'View result'
          when 'winner_payout_sent' then 'View payout'
          when 'donation_recipient_change_required' then 'Choose charity'
          when 'submission_disqualified' then 'View details'
          when 'submission_reinstated' then 'View details'
          when 'wallet_issue_received' then 'View claim'
          when 'wallet_issue_correction_ready' then 'Review claim'
          when 'wallet_issue_resolved' then 'View claim'
          when 'comment_reply' then 'View reply'
          when 'comment_mention' then 'View mention'
          when 'user_warning_issued' then 'View warning'
          when 'user_warning_overruled' then 'View updated status'
          when 'user_warning_appeal_upheld' then 'View outcome'
          when 'social_account_linking_unlocked' then 'Add social account'
          else 'View results' end,
        'createdAt', notification.created_at, 'readAt', notification.read_at
      ) payload
    from public.account_notifications notification
    join public.notification_events event on event.id = notification.event_id
    where notification.owner_discord_user_id = v_owner_id
      and notification.visible_in_product
      and (notification.read_at is null or notification.read_at > transaction_timestamp() - interval '3 days')
      and (p_before_created_at is null or (notification.created_at, notification.id) < (p_before_created_at, p_before_id))
    order by notification.created_at desc, notification.id desc
    limit p_limit + 1
  ) item;
  return jsonb_build_object('items', v_items);
end;
$function$;

alter function public.get_own_notifications(uuid,timestamptz,uuid,integer) owner to postgres;
revoke all on function public.get_own_notifications(uuid,timestamptz,uuid,integer) from public, anon, authenticated, discord_bot, service_role;
grant execute on function public.get_own_notifications(uuid,timestamptz,uuid,integer) to service_role;
