-- Retire free-form social writers and upload-time public identity snapshots.
-- Historical rows, constraints, trigger and owner-only reset remain intact.
do $preflight$
begin
  if (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname='commit_submission_upload') <> 1
    or md5(pg_get_functiondef('public.commit_submission_upload(uuid,uuid,integer,integer)'::regprocedure)) <> 'ef5640b0f08087816e3854948baab93a'
    or to_regprocedure('public.get_own_social_account_visibility(uuid)') is null then
    raise exception 'SOCIAL_PUBLIC_CUTOVER_BASELINE_MISMATCH';
  end if;
end;
$preflight$;

CREATE OR REPLACE FUNCTION public.commit_submission_upload(p_operation_id uuid, p_session_id uuid, p_media_width integer, p_media_height integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_now timestamptz;
  v_discord_user_id text;
  v_operation public.submission_upload_operations%rowtype;
  v_cycle public.voting_cycles%rowtype;
  v_user public.user_logs%rowtype;
  v_membership public.discord_member_state%rowtype;
  v_rules_version integer;
  v_submission_id bigint;
  v_used integer;
  v_last_completed_at timestamptz;
  v_next_allowed_at timestamptz;
  v_cooldown_remaining integer := 0;
begin
  if p_operation_id is null or p_session_id is null then
    return jsonb_build_object('outcome', 'invalid_request');
  end if;

  if p_media_width is null
    or p_media_height is null
    or p_media_width not between 1 and 2400
    or p_media_height not between 1 and 16383
    or p_media_width::bigint * p_media_height::bigint > 24000000
  then
    return jsonb_build_object('outcome', 'invalid_media_metadata');
  end if;

  select session.discord_user_id
  into v_discord_user_id
  from public.sessions session
  where session.id = p_session_id
    and session.revoked_at is null;

  if not found then
    return jsonb_build_object('outcome', 'not_authenticated');
  end if;

  select operation.*
  into v_operation
  from public.submission_upload_operations operation
  where operation.id = p_operation_id
    and operation.discord_user_id = v_discord_user_id
  for update;

  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  if v_operation.status = 'completed' then
    return jsonb_build_object(
      'outcome', 'already_completed',
      'operationId', v_operation.id,
      'cycleId', v_operation.cycle_id,
      'submissionId', v_operation.submission_id
    );
  end if;

  if v_operation.status <> 'r2_uploaded' then
    return jsonb_build_object(
      'outcome', 'invalid_state',
      'status', v_operation.status
    );
  end if;

  if v_operation.payout_choice is null or (
    v_operation.payout_choice = 'keep'
    and (
      v_operation.wallet_source not in ('manual', 'profile')
      or not public.is_valid_sol_recipient_address(
        v_operation.wallet_address
      )
      or v_operation.split_percent is not null
      or v_operation.charity is not null
    )
  ) or (
    v_operation.payout_choice = 'donate'
    and (
      v_operation.wallet_source <> 'none'
      or v_operation.wallet_address <> ''
      or v_operation.profile_wallet_version is not null
      or v_operation.split_percent is not null
      or nullif(btrim(v_operation.charity), '') is null
    )
  ) or (
    v_operation.payout_choice = 'split'
    and (
      v_operation.wallet_source not in ('manual', 'profile')
      or not public.is_valid_sol_recipient_address(
        v_operation.wallet_address
      )
      or v_operation.split_percent not between 1 and 99
      or nullif(btrim(v_operation.charity), '') is null
    )
  ) or (
    v_operation.wallet_source = 'manual'
    and v_operation.profile_wallet_version is not null
  ) or (
    v_operation.wallet_source = 'profile'
    and (
      v_operation.profile_wallet_version is null
      or v_operation.profile_wallet_version <= 0
    )
  ) then
    return jsonb_build_object('outcome', 'invalid_private_data');
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'submission-upload-user-cycle:' ||
      v_discord_user_id || ':' || v_operation.cycle_id::text,
      0
    )
  );

  select cycle.*
  into v_cycle
  from public.voting_cycles cycle
  where cycle.id = v_operation.cycle_id
  for update;

  if not found or v_cycle.status::text not in ('submission_open', 'active') then
    return jsonb_build_object('outcome', 'cycle_not_open');
  end if;

  v_now := clock_timestamp();

  select users.*
  into v_user
  from public.user_logs users
  where users.discord_user_id = v_discord_user_id;

  if not found then
    return jsonb_build_object('outcome', 'dependency_unavailable');
  end if;

  if v_user.is_banned then
    return jsonb_build_object('outcome', 'banned');
  end if;

  if coalesce(v_user.upload_fail_count, 0) >= 5 then
    return jsonb_build_object('outcome', 'rate_limited');
  end if;

  select rules.current_version
  into v_rules_version
  from public.rules_meta rules
  where rules.id = 1;

  if not found then
    return jsonb_build_object('outcome', 'dependency_unavailable');
  end if;

  if v_user.accepted_rules_version is distinct from v_rules_version then
    return jsonb_build_object('outcome', 'rules_not_accepted');
  end if;

  select membership.*
  into v_membership
  from public.discord_member_state membership
  where membership.discord_user_id = v_discord_user_id;

  if not found or not coalesce(v_membership.is_in_discord, false) then
    return jsonb_build_object('outcome', 'not_in_discord');
  end if;

  if v_membership.discord_joined_at is null
    or v_membership.discord_joined_at > v_now - interval '10 minutes'
  then
    return jsonb_build_object('outcome', 'joined_too_recently');
  end if;

  select count(*)::integer
  into v_used
  from public.submissions submission
  where submission.cycle_id = v_operation.cycle_id
    and submission.discord_user_id = v_discord_user_id;

  if v_used >= v_cycle.submissions_per_user then
    return jsonb_build_object(
      'outcome', 'upload_limit_reached',
      'used', v_used,
      'limit', v_cycle.submissions_per_user,
      'remaining', 0
    );
  end if;

  select max(operation.completed_at)
  into v_last_completed_at
  from public.submission_upload_operations operation
  where operation.discord_user_id = v_discord_user_id
    and operation.cycle_id = v_operation.cycle_id
    and operation.status = 'completed';

  if v_last_completed_at is not null then
    v_next_allowed_at := v_last_completed_at
      + make_interval(secs => v_cycle.upload_success_cooldown_seconds);
    v_cooldown_remaining := greatest(
      0,
      ceil(extract(epoch from (v_next_allowed_at - v_now)))::integer
    );
  end if;

  if v_cooldown_remaining > 0 then
    return jsonb_build_object(
      'outcome', 'cooldown_active',
      'used', v_used,
      'limit', v_cycle.submissions_per_user,
      'remaining', v_cycle.submissions_per_user - v_used,
      'cooldownRemainingSeconds', v_cooldown_remaining,
      'nextUploadAllowedAt', v_next_allowed_at
    );
  end if;

  if v_operation.storage_provider <> 'r2'
    or v_operation.storage_key !~ (
      '^' || v_operation.cycle_id::text || '/[0-9A-Fa-f-]{36}[.]webp$'
    )
    or v_operation.media_type <> 'image/webp'
    or v_operation.media_bytes <= 0
    or v_operation.content_sha256 !~ '^[0-9a-f]{64}$'
  then
    return jsonb_build_object('outcome', 'invalid_media_metadata');
  end if;

  insert into public.submissions (
    cycle_id,
    discord_user_id,
    r2_key,
    discord_username_at_upload,
    media_width,
    media_height
  ) values (
    v_operation.cycle_id,
    v_discord_user_id,
    v_operation.storage_key,
    coalesce(v_user.current_discord_username, 'unknown'),
    p_media_width,
    p_media_height
  )
  returning id into v_submission_id;

  insert into public.submission_private_data (
    submission_id,
    x_username,
    wallet_address,
    payout_choice,
    split_percent,
    charity
  ) values (
    v_submission_id,
    null,
    v_operation.wallet_address,
    v_operation.payout_choice,
    v_operation.split_percent,
    v_operation.charity
  );

  -- Public social identities are resolved at read time from current owner consent.

  insert into public.upload_logs (
    cycle_id,
    discord_user_id,
    submission_id,
    status,
    reason
  ) values (
    v_operation.cycle_id::text,
    v_discord_user_id,
    v_submission_id::text,
    'success',
    null
  );

  update public.submission_upload_operations operation
  set
    status = 'completed',
    submission_id = v_submission_id,
    cleanup_required = false,
    last_error_code = null,
    updated_at = v_now,
    last_attempt_at = v_now,
    completed_at = v_now
  where operation.id = v_operation.id;

  v_used := v_used + 1;
  v_next_allowed_at := v_now
    + make_interval(secs => v_cycle.upload_success_cooldown_seconds);

  return jsonb_build_object(
    'outcome', 'completed',
    'operationId', v_operation.id,
    'cycleId', v_operation.cycle_id,
    'submissionId', v_submission_id,
    'socialSnapshotCount', 0,
    'used', v_used,
    'limit', v_cycle.submissions_per_user,
    'remaining', greatest(v_cycle.submissions_per_user - v_used, 0),
    'cooldownRemainingSeconds', case
      when v_used < v_cycle.submissions_per_user
        then v_cycle.upload_success_cooldown_seconds
      else 0
    end,
    'nextUploadAllowedAt', case
      when v_used < v_cycle.submissions_per_user then v_next_allowed_at
      else null
    end
  );
end;
$function$;

alter function public.commit_submission_upload(uuid,uuid,integer,integer) owner to postgres;
revoke all on function public.commit_submission_upload(uuid,uuid,integer,integer) from public, anon, authenticated, discord_bot;
grant execute on function public.commit_submission_upload(uuid,uuid,integer,integer) to service_role;

-- Preserve the existing restricted historical reader, remove all application writes.
revoke all on table public.user_social_links, public.submission_social_links,
  public.social_verification_logs from public, anon, authenticated, discord_bot, service_role;
grant select on table public.user_social_links, public.submission_social_links,
  public.social_verification_logs to service_role;
