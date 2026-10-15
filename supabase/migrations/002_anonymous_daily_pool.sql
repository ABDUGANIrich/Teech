-- Apply once after 001_teech.sql. Existing data and function permissions remain.
-- Anonymous AI reservations share a 100-call UTC-day pool, in addition to
-- per-visitor and app-wide limits. All checks and the insert use one lock.
create or replace function public.reserve_usage(
  p_actor text, p_slot text, p_actor_limit integer,
  p_app_limit integer, p_minute_limit integer
)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare day_start timestamptz := date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
begin
  perform pg_advisory_xact_lock(hashtextextended('teech-usage',0));
  if exists(select 1 from usage_events where slot=p_slot) then raise exception 'CALL_ALREADY_RESERVED'; end if;
  if p_actor_limit<1 or p_app_limit<1 or p_minute_limit<1 then raise exception 'QUOTA_EXCEEDED'; end if;
  if (select count(*) from usage_events where created_at>=day_start and actor=p_actor)>=p_actor_limit
    or (select count(*) from usage_events where created_at>=day_start and (slot like 'start:%')=(p_slot like 'start:%'))>=p_app_limit
    or (select count(*) from usage_events where created_at>now()-interval '1 minute' and (slot like 'start:%')=(p_slot like 'start:%'))>=p_minute_limit
    then raise exception 'QUOTA_EXCEEDED'; end if;
  -- Include the legacy anonymous IP bucket so today's earlier calls count too.
  if p_slot not like 'start:%' and (p_actor like 'anon:%' or p_actor like 'ip:%')
    and (select count(*) from usage_events
         where created_at>=day_start and slot not like 'start:%'
           and (actor like 'anon:%' or actor like 'ip:%'))>=100
    then raise exception 'ANONYMOUS_POOL_EXCEEDED'; end if;
  insert into usage_events(slot,actor) values(p_slot,p_actor);
end $$;
