-- Kindred MVP. All timestamps are UTC; dates and notification windows use profile.timezone.
create extension if not exists pgcrypto;
create function public.valid_schedule(s jsonb) returns boolean language sql immutable as $$
 select coalesce(jsonb_typeof(s)='object' and s->>'kind' in ('daily','weekly','custom')
 and jsonb_typeof(s->'days')='array' and jsonb_array_length(s->'days')<=7
 and not exists(select 1 from jsonb_array_elements(s->'days') d where d::text !~ '^[0-6]$')
 and (s->>'kind'='daily' or jsonb_array_length(s->'days')>0)
 and (s->>'kind'<>'weekly' or jsonb_array_length(s->'days')=1),false)
$$;
create table public.profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null default '' check(length(display_name)<=60),
 timezone text not null default 'UTC', onboarded boolean not null default false,
 checkins_enabled boolean not null default false, checkin_time time not null default '18:00',
 quiet_start time not null default '21:00', quiet_end time not null default '08:00',
 daily_limit int not null default 2 check(daily_limit between 0 and 5), created_at timestamptz not null default now()
);
create function public.validate_timezone() returns trigger language plpgsql set search_path=public as $$
begin
 if not exists(select 1 from pg_timezone_names where name=new.timezone) then raise exception 'Invalid IANA timezone'; end if;
 return new;
end $$;
create trigger profile_timezone before insert or update on public.profiles for each row execute function public.validate_timezone();
create table public.messages (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 role text not null check(role in ('user','assistant')), content text not null check(length(content) between 1 and 12000),
 proposal jsonb, request_id uuid, created_at timestamptz not null default now(), unique(user_id,request_id,role)
);
create index messages_context on public.messages(user_id,created_at desc);
create table public.goals (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 title text not null check(length(title) between 1 and 160), steps jsonb not null default '[]' check(jsonb_typeof(steps)='array' and jsonb_array_length(steps)<=10),
 schedule jsonb not null default '{"kind":"daily","days":[]}' check(public.valid_schedule(schedule)),
 status text not null default 'active' check(status in ('active','paused')),
 source_message_id uuid references public.messages(id) on delete set null,
 created_at timestamptz not null default now(), unique(user_id,source_message_id), unique(id,user_id)
);
create table public.completions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 goal_id uuid not null, local_date date not null, created_at timestamptz not null default now(),
 foreign key(goal_id,user_id) references public.goals(id,user_id) on delete cascade,
 unique(goal_id,local_date)
);
create table public.events (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 title text not null check(length(title) between 1 and 160), starts_at timestamptz not null,
 timezone text not null, duration_minutes int not null default 30 check(duration_minutes between 1 and 1440),
 reminder_minutes int not null default 30 check(reminder_minutes between 0 and 10080),
 post_checkin boolean not null default false, source_message_id uuid references public.messages(id) on delete set null,
 created_at timestamptz not null default now(), unique(user_id,source_message_id)
);
create trigger event_timezone before insert or update on public.events for each row execute function public.validate_timezone();
create table public.memories (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 content text not null check(length(content) between 1 and 1000), created_at timestamptz not null default now()
);
create table public.devices (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 token text not null unique check(token ~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$'), created_at timestamptz not null default now()
);
create table public.notification_jobs (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 event_id uuid references public.events(id) on delete set null,
 kind text not null check(kind in ('reminder','post_activity','daily_checkin')),
 dedupe_key text not null unique, run_at timestamptz not null, expires_at timestamptz not null,
 status text not null default 'pending' check(status in ('pending','processing','sent','failed','skipped')),
 attempts int not null default 0, locked_at timestamptz, sent_at timestamptz,
 last_error text, tickets jsonb, created_at timestamptz not null default now()
);
create index pending_jobs on public.notification_jobs(run_at) where status='pending';
create table public.chat_requests (
 id uuid primary key,user_id uuid not null references auth.users(id) on delete cascade,created_at timestamptz not null default now()
);
-- The client cannot manufacture assistant messages, jobs, rate-limit records, or push tokens.
do $$ declare t text; begin
 foreach t in array array['profiles','goals','completions','events','memories'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('create policy own_data on public.%I for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid())',t);
 execute format('grant select,insert,update,delete on public.%I to authenticated',t);
 end loop;
 foreach t in array array['messages','devices','notification_jobs','chat_requests'] loop
 execute format('alter table public.%I enable row level security',t);
 end loop;
end $$;
create policy read_messages on public.messages for select to authenticated using(user_id=auth.uid());
create policy delete_messages on public.messages for delete to authenticated using(user_id=auth.uid());
create policy read_devices on public.devices for select to authenticated using(user_id=auth.uid());
create policy delete_devices on public.devices for delete to authenticated using(user_id=auth.uid());
grant select,delete on public.messages,public.devices to authenticated;
grant all on all tables in schema public to service_role;
-- Cross-user source IDs are rejected even though FK existence alone would allow them.
create function public.validate_source() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.source_message_id is not null and not exists(select 1 from messages where id=new.source_message_id and user_id=new.user_id and role='assistant') then
 raise exception 'Proposal not found'; end if; return new;
end $$;
create trigger goal_source before insert or update on public.goals for each row execute function public.validate_source();
create trigger event_source before insert or update on public.events for each row execute function public.validate_source();
create function public.register_device(p_token text) returns void language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 insert into devices(user_id,token) values(auth.uid(),p_token) on conflict(token) do update set user_id=excluded.user_id;
end $$;
revoke all on function public.register_device(text) from public;
grant execute on function public.register_device(text) to authenticated;
create function public.queue_event() returns trigger language plpgsql security definer set search_path=public as $$
begin
 delete from notification_jobs where event_id=new.id and status<>'sent';
 if new.starts_at<=now() then raise exception 'Choose a future event'; end if;
 insert into notification_jobs(user_id,event_id,kind,dedupe_key,run_at,expires_at)
 values(new.user_id,new.id,'reminder',new.id||':reminder',greatest(now(),new.starts_at-make_interval(mins=>new.reminder_minutes)),new.starts_at) on conflict(dedupe_key) do nothing;
 if new.post_checkin then
 insert into notification_jobs(user_id,event_id,kind,dedupe_key,run_at,expires_at)
 values(new.user_id,new.id,'post_activity',new.id||':post',new.starts_at+make_interval(mins=>new.duration_minutes+30),new.starts_at+interval '1 day') on conflict(dedupe_key) do nothing;
 end if; return new;
end $$;
create function public.cancel_event_jobs() returns trigger language plpgsql security definer set search_path=public as $$
begin
 -- Preserve accepted-delivery audit records so deletion cannot reset the daily cap.
 delete from notification_jobs where event_id=old.id and status<>'sent';
 return old;
end $$;
create trigger cancel_event_jobs before delete on public.events for each row execute function public.cancel_event_jobs();
create trigger event_jobs after insert or update on public.events for each row execute function public.queue_event();
-- Serialized per-user rate limiting. Called only by the authenticated AI backend.
create function public.claim_chat(p_user uuid,p_request uuid) returns boolean language plpgsql security definer set search_path=public as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 if exists(select 1 from chat_requests where id=p_request) then return false; end if;
 if (select count(*) from chat_requests where user_id=p_user and created_at>now()-interval '1 minute')>=8
 or (select count(*) from chat_requests where user_id=p_user and created_at>now()-interval '1 day')>=150 then raise exception 'Please take a short pause and try again.'; end if;
 insert into chat_requests(id,user_id) values(p_request,p_user);return true;
end $$;
revoke all on function public.claim_chat(uuid,uuid) from public,authenticated;
grant execute on function public.claim_chat(uuid,uuid) to service_role;
-- Every-minute worker: generates one check-in per local day, then atomically claims due jobs.
create function public.claim_notifications(p_limit int default 40)
returns setof public.notification_jobs language plpgsql security definer set search_path=public as $$
declare p profiles; j notification_jobs; local_now timestamp; used int; quiet boolean;
begin
 update notification_jobs set status='skipped',last_error='Expired before delivery' where status='pending' and expires_at<=now();
 -- Do not resend ambiguous in-flight requests after a crash (push providers offer no idempotency key).
 update notification_jobs set status='failed',last_error='Delivery outcome unknown; not retried' where status='processing' and locked_at<now()-interval '10 minutes';
 for p in select * from profiles order by user_id for update skip locked loop
 local_now:=now() at time zone p.timezone;
 if p.checkins_enabled and local_now::time>=p.checkin_time then
 insert into notification_jobs(user_id,kind,dedupe_key,run_at,expires_at)
 values(p.user_id,'daily_checkin',p.user_id||':daily:'||local_now::date,now(),(local_now::date+1)::timestamp at time zone p.timezone)
 on conflict(dedupe_key) do nothing;
 end if;
 update notification_jobs set status='skipped',last_error='Check-ins disabled' where user_id=p.user_id and kind='daily_checkin' and status='pending' and not p.checkins_enabled;
 update notification_jobs set run_at=(local_now::date+p.checkin_time) at time zone p.timezone where user_id=p.user_id and kind='daily_checkin' and status='pending';
 quiet:=case when p.quiet_start=p.quiet_end then false when p.quiet_start<p.quiet_end then local_now::time>=p.quiet_start and local_now::time<p.quiet_end else local_now::time>=p.quiet_start or local_now::time<p.quiet_end end;
 if quiet or p.daily_limit=0 then continue; end if;
 select count(*) into used from notification_jobs where user_id=p.user_id and status in ('sent','processing') and (coalesce(sent_at,locked_at) at time zone p.timezone)::date=local_now::date;
 for j in select * from notification_jobs where user_id=p.user_id and status='pending' and run_at<=now() and expires_at>now() order by run_at for update skip locked loop
 if used>=p.daily_limit or p_limit<=0 then exit; end if;
 update notification_jobs set status='processing',locked_at=now(),attempts=attempts+1 where id=j.id returning * into j;
 used:=used+1;p_limit:=p_limit-1;return next j;
 end loop;
 if p_limit<=0 then exit;end if;
 end loop;
end $$;
revoke all on function public.claim_notifications(int) from public,authenticated;
grant execute on function public.claim_notifications(int) to service_role;
