-- Voice-first setup: a few goals, a time, and selected check-in days.
-- Apply after 202610200001_initial.sql. Existing goals and progress are retained.
begin;

create or replace function public.valid_checkin_days(days smallint[])
returns boolean language sql immutable as $$
  select coalesce(
    array_ndims(days) = 1
    and cardinality(days) between 1 and 7
    and not exists(select 1 from unnest(days) d where d is null or d < 0 or d > 6)
    and (select count(distinct d) from unnest(days) d) = cardinality(days),
    false
  );
$$;
revoke all on function public.valid_checkin_days(smallint[]) from public,anon,authenticated;
grant execute on function public.valid_checkin_days(smallint[]) to authenticated,service_role;

alter table public.profiles
  add column if not exists checkin_days smallint[] not null default '{0,1,2,3,4,5,6}';
alter table public.profiles drop constraint if exists profiles_checkin_days_valid;
alter table public.profiles add constraint profiles_checkin_days_valid
  check (public.valid_checkin_days(checkin_days));

create or replace function public.save_companion_plan(
  p_goals text[],
  p_checkin_time text,
  p_checkin_days integer[],
  p_timezone text
) returns void language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  titles text[];
  goal_title text;
  goal_id uuid;
  retained_ids uuid[] := '{}';
begin
  if caller is null then raise exception 'Please sign in before saving your plan'; end if;
  if p_goals is null or array_ndims(p_goals) <> 1 or cardinality(p_goals) not between 1 and 5 then
    raise exception 'Choose between one and five goals';
  end if;
  if exists(select 1 from unnest(p_goals) g where g is null or length(btrim(g)) not between 1 and 160) then
    raise exception 'Each goal needs a short name, up to 160 characters';
  end if;
  select array_agg(btrim(g) order by n) into titles from unnest(p_goals) with ordinality as x(g,n);
  if (select count(distinct lower(g)) from unnest(titles) g) <> cardinality(titles) then
    raise exception 'Give each goal a different name';
  end if;
  if p_checkin_time is null or p_checkin_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'Choose a check-in time in HH:MM format';
  end if;
  if p_checkin_days is null
     or exists(select 1 from unnest(p_checkin_days) d where d is null or d < 0 or d > 6)
     or not public.valid_checkin_days(p_checkin_days::smallint[]) then
    raise exception 'Choose one or more different days of the week';
  end if;
  if p_timezone is null or not exists(select 1 from pg_timezone_names where name = p_timezone) then
    raise exception 'Choose a valid timezone';
  end if;

  -- Serializes concurrent spoken and typed saves for this user.
  perform pg_advisory_xact_lock(hashtextextended(caller::text, 1));
  insert into public.profiles(user_id, display_name, timezone, onboarded, checkin_time, checkin_days)
  values(caller, 'friend', p_timezone, true, p_checkin_time::time,
    array(select d::smallint from unnest(p_checkin_days) d order by d))
  on conflict(user_id) do update set
    display_name = coalesce(nullif(btrim(profiles.display_name), ''), 'friend'),
    timezone = excluded.timezone,
    onboarded = true,
    checkin_time = excluded.checkin_time,
    checkin_days = excluded.checkin_days;
  -- checkins_enabled is deliberately unchanged: this plan does not opt into push.

  foreach goal_title in array titles loop
    select id into goal_id from public.goals
      where user_id = caller and lower(btrim(title)) = lower(goal_title)
      order by (status = 'active') desc, created_at, id limit 1 for update;
    if goal_id is null then
      insert into public.goals(user_id,title) values(caller,goal_title) returning id into goal_id;
    else
      update public.goals set title = goal_title, status = 'active' where id = goal_id and user_id = caller;
    end if;
    retained_ids := array_append(retained_ids,goal_id);
  end loop;
  -- An edited plan never destroys previous progress. Removed goals are paused.
  update public.goals set status = 'paused'
    where user_id = caller and status = 'active' and not (id = any(retained_ids));
end;
$$;
revoke all on function public.save_companion_plan(text[],text,integer[],text) from public,anon,authenticated;
grant execute on function public.save_companion_plan(text[],text,integer[],text) to authenticated;

-- Browser/native transcripts are user-supplied context, never server-verified assistant messages.
create table if not exists public.voice_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz,
  transcript jsonb not null default '[]',
  constraint voice_session_expiry check(expires_at > created_at),
  constraint voice_transcript_array check(jsonb_typeof(transcript) = 'array' and jsonb_array_length(transcript) <= 200),
  constraint voice_transcript_size check(octet_length(transcript::text) <= 65536)
);
create index if not exists voice_sessions_recent on public.voice_sessions(user_id,created_at desc);
alter table public.voice_sessions enable row level security;
drop policy if exists read_own_voice_sessions on public.voice_sessions;
create policy read_own_voice_sessions on public.voice_sessions for select to authenticated using(user_id = auth.uid());
drop policy if exists delete_own_voice_sessions on public.voice_sessions;
create policy delete_own_voice_sessions on public.voice_sessions for delete to authenticated using(user_id = auth.uid());
-- Project default grants may include TRUNCATE, which RLS does not constrain.
-- Reset API-role privileges completely before granting the intended operations.
revoke all on public.voice_sessions from public,anon,authenticated;
grant select,delete on public.voice_sessions to authenticated;
grant all on public.voice_sessions to service_role;

-- Private rate-limit ledger survives user deletion of conversation history.
create table if not exists public.voice_requests (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists voice_requests_recent on public.voice_requests(user_id,created_at desc);
alter table public.voice_requests enable row level security;
revoke all on public.voice_requests from public,anon,authenticated;
grant all on public.voice_requests to service_role;

create or replace function public.claim_voice_session(p_user uuid,p_session uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_user is null or p_session is null then raise exception 'A user and session ID are required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 2));
  if exists(select 1 from public.voice_requests where id = p_session) then return false; end if;
  if (select count(*) from public.voice_requests where user_id = p_user and created_at > now() - interval '1 minute') >= 3
    or (select count(*) from public.voice_requests where user_id = p_user and created_at > now() - interval '1 day') >= 20 then
    raise exception 'Voice session limit reached. Please try again later';
  end if;
  insert into public.voice_requests(id,user_id) values(p_session,p_user);
  insert into public.voice_sessions(id,user_id,expires_at) values(p_session,p_user,now() + interval '30 minutes');
  return true;
end;
$$;
revoke all on function public.claim_voice_session(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_voice_session(uuid,uuid) to service_role;

-- Repair any default anonymous grant inherited by the original service-only limiter.
revoke all on function public.claim_chat(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_chat(uuid,uuid) to service_role;

-- Optional push delivery follows the same chosen weekdays. The app itself never calls automatically.
create or replace function public.claim_notifications(p_limit int default 40)
returns setof public.notification_jobs language plpgsql security definer set search_path = public as $$
declare
  p profiles;
  j notification_jobs;
  local_now timestamp;
  used int;
  quiet boolean;
  scheduled_today boolean;
begin
  update notification_jobs set status='skipped',last_error='Expired before delivery'
    where status='pending' and expires_at<=now();
  update notification_jobs set status='failed',last_error='Delivery outcome unknown; not retried'
    where status='processing' and locked_at<now()-interval '10 minutes';
  for p in select * from profiles order by user_id for update skip locked loop
    local_now := now() at time zone p.timezone;
    scheduled_today := extract(dow from local_now)::integer = any(p.checkin_days);
    if p.checkins_enabled and scheduled_today and local_now::time >= p.checkin_time then
      insert into notification_jobs(user_id,kind,dedupe_key,run_at,expires_at)
      values(p.user_id,'daily_checkin',p.user_id||':daily:'||local_now::date,
        now(),(local_now::date+1)::timestamp at time zone p.timezone)
      on conflict(dedupe_key) do nothing;
    end if;
    update notification_jobs set status='skipped',last_error='Check-in preference changed'
      where user_id=p.user_id and kind='daily_checkin' and status='pending'
        and (not p.checkins_enabled or not scheduled_today);
    update notification_jobs set run_at=(local_now::date+p.checkin_time) at time zone p.timezone
      where user_id=p.user_id and kind='daily_checkin' and status='pending';
    quiet := case
      when p.quiet_start=p.quiet_end then false
      when p.quiet_start<p.quiet_end then local_now::time>=p.quiet_start and local_now::time<p.quiet_end
      else local_now::time>=p.quiet_start or local_now::time<p.quiet_end end;
    if quiet or p.daily_limit=0 then continue; end if;
    select count(*) into used from notification_jobs
      where user_id=p.user_id and status in ('sent','processing')
        and (coalesce(sent_at,locked_at) at time zone p.timezone)::date=local_now::date;
    for j in select * from notification_jobs
      where user_id=p.user_id and status='pending' and run_at<=now() and expires_at>now()
      order by run_at for update skip locked
    loop
      if used>=p.daily_limit or p_limit<=0 then exit; end if;
      update notification_jobs set status='processing',locked_at=now(),attempts=attempts+1
        where id=j.id returning * into j;
      used:=used+1;
      p_limit:=p_limit-1;
      return next j;
    end loop;
    if p_limit<=0 then exit; end if;
  end loop;
end;
$$;
revoke all on function public.claim_notifications(int) from public,anon,authenticated;
grant execute on function public.claim_notifications(int) to service_role;

commit;
