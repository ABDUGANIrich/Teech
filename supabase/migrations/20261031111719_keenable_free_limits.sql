-- Shared server-side admission for Keenable's authenticated free allowance.
-- A rolling 31-day cap is deliberately conservative: the organization's actual
-- monthly reset day is unknown. Failures/cancellations retain reservations.
create table public.keenable_usage (
  id uuid primary key,
  created_at timestamptz not null default clock_timestamp(),
  outcome text not null default 'reserved'
    check (outcome in ('reserved','free','failed','exhausted','rate_limited','billing')),
  credits numeric check (credits >= 0)
);
create index keenable_usage_created_idx on public.keenable_usage(created_at);
create table public.keenable_guard (
  id integer primary key check (id=1),
  blocked_until timestamptz not null default '-infinity',
  reason text not null default 'rate' check (reason in ('rate','exhausted','billing'))
);
insert into public.keenable_guard(id) values(1);
alter table public.keenable_usage enable row level security;
alter table public.keenable_guard enable row level security;
revoke all on public.keenable_usage, public.keenable_guard from public, anon, authenticated;
grant select, insert, update, delete on public.keenable_usage to service_role;
grant select, update on public.keenable_guard to service_role;

create function public.reserve_keenable_search(p_request_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  v_now timestamptz;
  v_guard public.keenable_guard;
begin
  perform pg_advisory_xact_lock(hashtextextended('teech-keenable-free',0));
  v_now := clock_timestamp();
  -- Keep one extra day for diagnostics; never use the AI event cleanup policy.
  delete from public.keenable_usage where created_at < v_now-interval '32 days';
  select * into strict v_guard from public.keenable_guard where id=1;
  if v_guard.blocked_until > v_now then
    return jsonb_build_object('allowed',false,'reason',v_guard.reason);
  end if;
  if exists(select 1 from public.keenable_usage where id=p_request_id) then
    return jsonb_build_object('allowed',false,'reason','duplicate');
  end if;
  if (select count(*) from public.keenable_usage
      where created_at > v_now-interval '31 days') >= 100000 then
    return jsonb_build_object('allowed',false,'reason','allowance');
  end if;
  if (select count(*) from public.keenable_usage
      where created_at > v_now-interval '1 second') >= 10 then
    return jsonb_build_object('allowed',false,'reason','rate');
  end if;
  insert into public.keenable_usage(id,created_at) values(p_request_id,v_now);
  return jsonb_build_object('allowed',true);
end $$;

create function public.record_keenable_search(
  p_request_id uuid, p_outcome text,
  p_credits numeric default null, p_retry_seconds integer default 60
)
returns void language plpgsql security invoker set search_path='' as $$
declare v_until timestamptz;
begin
  if p_outcome not in ('free','failed','exhausted','rate_limited','billing')
     or p_outcome is null then raise exception 'INVALID_SEARCH_OUTCOME'; end if;
  perform pg_advisory_xact_lock(hashtextextended('teech-keenable-free',0));
  update public.keenable_usage set outcome=p_outcome, credits=p_credits
    where id=p_request_id and outcome='reserved';
  if not found then raise exception 'SEARCH_RESERVATION_MISSING'; end if;
  if p_outcome='billing' then v_until := 'infinity';
  elsif p_outcome='exhausted' then v_until := clock_timestamp()+interval '1 hour';
  elsif p_outcome='rate_limited' then
    v_until := clock_timestamp()+make_interval(secs=>greatest(1,least(coalesce(p_retry_seconds,60),86400)));
  else return;
  end if;
  update public.keenable_guard set
    reason=case when v_until>blocked_until then
      case p_outcome when 'rate_limited' then 'rate' else p_outcome end else reason end,
    blocked_until=greatest(blocked_until,v_until) where id=1;
end $$;
revoke all on function public.reserve_keenable_search(uuid) from public, anon, authenticated;
revoke all on function public.record_keenable_search(uuid,text,numeric,integer) from public, anon, authenticated;
grant execute on function public.reserve_keenable_search(uuid) to service_role;
grant execute on function public.record_keenable_search(uuid,text,numeric,integer) to service_role;
