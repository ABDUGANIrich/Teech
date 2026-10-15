-- Run in the Supabase SQL editor, or with `supabase db push`.
create table public.topics (
  id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(title) between 1 and 100),
  notes text not null check (length(notes) between 80 and 18000),
  version integer not null default 1, created_at timestamptz not null default now()
);
create table public.checklists (
  topic_id uuid not null references public.topics(id) on delete cascade,
  version integer not null, concepts jsonb not null check (jsonb_array_length(concepts) between 4 and 8),
  primary key(topic_id, version)
);
create table public.sessions (
  id uuid primary key, owner text not null,
  user_id uuid references auth.users(id) on delete cascade,
  topic_id uuid references public.topics(id) on delete cascade,
  data jsonb not null, created_at timestamptz not null default now()
);
create index sessions_owner on public.sessions(owner, created_at desc);
create table public.operations (
  actor text not null, key uuid not null, resource text not null, payload_hash text not null,
  state text not null default 'processing' check(state in ('processing','done','failed')),
  result jsonb, created_at timestamptz not null default now(), primary key(actor,key)
);
create unique index one_active_operation on public.operations(resource) where state='processing';
create table public.usage_events (
  slot text primary key, actor text not null, created_at timestamptz not null default now()
);
create index usage_time on public.usage_events(created_at);
create index usage_actor_time on public.usage_events(actor,created_at);
alter table public.topics enable row level security;
alter table public.checklists enable row level security;
alter table public.sessions enable row level security;
alter table public.operations enable row level security;
alter table public.usage_events enable row level security;
-- Browser clients may read their data. All writes go through validated server handlers.
create policy topics_read on public.topics for select to authenticated using(user_id=auth.uid());
create policy checklists_read on public.checklists for select to authenticated using(exists(select 1 from public.topics t where t.id=topic_id and t.user_id=auth.uid()));
create policy sessions_read on public.sessions for select to authenticated using(owner='user:' || auth.uid()::text);
revoke all on public.topics, public.checklists, public.sessions, public.operations, public.usage_events from anon, authenticated;
grant select on public.topics, public.checklists, public.sessions to authenticated;
grant all on public.topics, public.checklists, public.sessions, public.operations, public.usage_events to service_role;

create function public.begin_operation(p_actor text,p_key uuid,p_resource text,p_hash text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare prior public.operations;
begin
  perform pg_advisory_xact_lock(hashtextextended('teech-operations',0));
  -- A crashed invocation is never replayed against the provider.
  update operations set state='failed',result='{"error":"The request was interrupted. Your local draft is safe. Start a new attempt or finish the existing one."}'
    where state='processing' and created_at < now()-interval '150 seconds';
  select * into prior from operations where actor=p_actor and key=p_key;
  if found then
    if prior.payload_hash<>p_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    if prior.state='processing' then raise exception 'REQUEST_BUSY'; end if;
    return jsonb_build_object('cached',true,'result',prior.result);
  end if;
  if exists(select 1 from operations where resource=p_resource and state='processing') then raise exception 'REQUEST_BUSY'; end if;
  insert into operations(actor,key,resource,payload_hash) values(p_actor,p_key,p_resource,p_hash);
  return jsonb_build_object('cached',false);
end $$;

create function public.reserve_usage(p_actor text,p_slot text,p_actor_limit integer,p_app_limit integer,p_minute_limit integer)
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
  insert into usage_events(slot,actor) values(p_slot,p_actor);
end $$;

-- State and idempotency response are committed in the same transaction.
create function public.commit_operation(p_actor text,p_key uuid,p_result jsonb,p_mutation jsonb default null)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare op public.operations; item jsonb; topic_owner uuid;
begin
  select * into op from operations where actor=p_actor and key=p_key for update;
  if not found or op.state<>'processing' then raise exception 'REQUEST_NOT_ACTIVE'; end if;
  if p_mutation ? 'topic' then
    item:=p_mutation->'topic';
    if p_actor not like 'user:%' then raise exception 'FORBIDDEN'; end if;
    topic_owner:=substring(p_actor from 6)::uuid;
    if exists(select 1 from topics where id=(item->>'id')::uuid and user_id<>topic_owner) then raise exception 'FORBIDDEN'; end if;
    insert into topics(id,user_id,title,notes,version) values((item->>'id')::uuid,topic_owner,item->>'title',item->>'notes',(item->>'version')::int)
      on conflict(id) do update set title=excluded.title,notes=excluded.notes,version=excluded.version;
    insert into checklists(topic_id,version,concepts) values((item->>'id')::uuid,(item->>'version')::int,item->'concepts');
  end if;
  if p_mutation ? 'session' then
    item:=p_mutation->'session';
    if item->>'owner'<>p_actor then raise exception 'FORBIDDEN'; end if;
    if exists(select 1 from sessions where id=(item->>'id')::uuid and owner<>p_actor) then raise exception 'FORBIDDEN'; end if;
    if item->>'topic_id' is not null and not exists(select 1 from topics where id=(item->>'topic_id')::uuid and 'user:'||user_id::text=p_actor) then raise exception 'FORBIDDEN'; end if;
    insert into sessions(id,owner,user_id,topic_id,data) values((item->>'id')::uuid,p_actor,case when p_actor like 'user:%' then substring(p_actor from 6)::uuid else null end,(item->>'topic_id')::uuid,item)
      on conflict(id) do update set data=excluded.data;
  end if;
  if p_mutation ? 'delete' then
    -- Purge completed request snapshots of this topic as well as domain rows.
    delete from operations where actor=p_actor and state<>'processing' and (
      result->'topic'->>'id'=p_mutation->>'delete'
      or result->'session'->>'topic_id'=p_mutation->>'delete'
      or resource='topic:'||(p_mutation->>'delete')
      or resource in (select 'session:'||id::text from sessions where topic_id=(p_mutation->>'delete')::uuid and owner=p_actor)
    );
    delete from topics where id=(p_mutation->>'delete')::uuid and 'user:'||user_id::text=p_actor;
  end if;
  update operations set state=case when p_result ? 'error' then 'failed' else 'done' end,result=p_result where actor=p_actor and key=p_key;
end $$;
revoke all on function public.begin_operation(text,uuid,text,text) from public,anon,authenticated;
revoke all on function public.reserve_usage(text,text,integer,integer,integer) from public,anon,authenticated;
revoke all on function public.commit_operation(text,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.begin_operation(text,uuid,text,text) to service_role;
grant execute on function public.reserve_usage(text,text,integer,integer,integer) to service_role;
grant execute on function public.commit_operation(text,uuid,jsonb,jsonb) to service_role;
