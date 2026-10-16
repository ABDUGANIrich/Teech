-- Additive Teacher mode. Apply after 003. No browser access to assessment keys.
create table public.learning_sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  state jsonb not null check (state->>'schemaVersion'='1' and state->>'id'=id::text),
  version integer not null default 0 check(version>=0),
  provider_attempts integer not null default 0 check(provider_attempts between 0 and 22),
  topic_id uuid references public.topics(id) on delete set null,
  teaching_id uuid references public.sessions(id) on delete set null,
  created_at timestamptz not null default now()
);
create index learning_owner_history on public.learning_sessions(user_id,created_at desc,id desc);
create table public.learning_assessments (
  session_id uuid not null references public.learning_sessions(id) on delete cascade,
  unit_id text not null, keys jsonb not null,
  primary key(session_id,unit_id)
);
alter table public.topics add column lesson_id uuid references public.learning_sessions(id) on delete set null;
alter table public.topics add column provenance jsonb;
alter table public.learning_sessions enable row level security;
alter table public.learning_assessments enable row level security;
create policy learning_read on public.learning_sessions for select to authenticated using(user_id=auth.uid());
revoke all on public.learning_sessions,public.learning_assessments from public,anon,authenticated;
grant select on public.learning_sessions to authenticated;
grant all on public.learning_sessions,public.learning_assessments to service_role;

-- Checkpoint submitted answers BEFORE network work; finish state, keys and cache
-- atomically. No transaction is held across a provider request.
create function public.save_teacher_operation(
  p_actor text,p_key uuid,p_state jsonb,p_expected_version integer,
  p_private jsonb default null,p_finish boolean default true,
  p_result jsonb default '{}',p_teaching jsonb default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare op public.operations; row public.learning_sessions; next_version integer;
  v_result jsonb; target uuid := (p_state->>'id')::uuid;
begin
  select * into op from operations where actor=p_actor and key=p_key for update;
  if not found or op.state<>'processing' or op.resource<>'learn:'||target::text or p_actor not like 'user:%' then raise exception 'REQUEST_NOT_ACTIVE'; end if;
  select * into row from learning_sessions where id=target for update;
  if found then
    if 'user:'||row.user_id::text<>p_actor then raise exception 'FORBIDDEN'; end if;
    if row.version<>p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
    next_version:=row.version+1;
    update learning_sessions set state=p_state,version=next_version where id=target;
  else
    if p_expected_version<>-1 then raise exception 'VERSION_CONFLICT'; end if;
    next_version:=0;
    insert into learning_sessions(id,user_id,state) values(target,substring(p_actor from 6)::uuid,p_state);
  end if;
  if p_private is not null then
    insert into learning_assessments(session_id,unit_id,keys) values(target,p_private->>'unitId',p_private->'keys');
  end if;
  if p_teaching is not null then
    if row.topic_id is not null or coalesce((row.state->'handoff'->>'done')::boolean,false) then raise exception 'HANDOFF_EXISTS'; end if;
    -- Reuse the existing source-required topic and immutable attempt commit.
    perform commit_operation(p_actor,p_key,'{}',p_teaching);
    update topics set lesson_id=target,provenance=p_teaching->'topic'->'provenance'
      where id=(p_teaching->'topic'->>'id')::uuid and 'user:'||user_id::text=p_actor;
    update learning_sessions set topic_id=(p_teaching->'topic'->>'id')::uuid,
      teaching_id=(p_teaching->'session'->>'id')::uuid where id=target;
  end if;
  select * into row from learning_sessions where id=target;
  v_result:=p_result || jsonb_build_object('learning',row.state || jsonb_build_object(
    'version',row.version,'providerAttempts',row.provider_attempts,'topicId',row.topic_id,'teachingId',row.teaching_id));
  if p_finish then
    update operations set state=case when p_result ? 'error' then 'failed' else 'done' end,result=v_result
      where actor=p_actor and key=p_key;
  end if;
  return v_result;
end $$;

-- The shared quota reservation and the lifetime teacher cap are one transaction.
create function public.reserve_teacher_usage(
  p_id uuid,p_key uuid,p_actor text,p_slot text,p_actor_limit integer,p_app_limit integer,p_minute_limit integer
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare row public.learning_sessions;
begin
  select * into row from learning_sessions where id=p_id for update;
  if not found or 'user:'||row.user_id::text<>p_actor then raise exception 'FORBIDDEN'; end if;
  if not exists(select 1 from operations where actor=p_actor and key=p_key and resource='learn:'||p_id::text and state='processing') then raise exception 'REQUEST_NOT_ACTIVE'; end if;
  if row.provider_attempts>=22 then raise exception 'TEACHER_BUDGET_EXCEEDED'; end if;
  perform reserve_usage(p_actor,p_slot,p_actor_limit,p_app_limit,p_minute_limit);
  update learning_sessions set provider_attempts=provider_attempts+1 where id=p_id;
end $$;

create function public.delete_teacher_operation(p_actor text,p_key uuid,p_id uuid,p_expected_version integer)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare row public.learning_sessions;
begin
  if not exists(select 1 from operations where actor=p_actor and key=p_key and resource='learn:'||p_id::text and state='processing') then raise exception 'REQUEST_NOT_ACTIVE'; end if;
  select * into row from learning_sessions where id=p_id for update;
  if not found or 'user:'||row.user_id::text<>p_actor then raise exception 'FORBIDDEN'; end if;
  if row.version<>p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
  -- Surviving teaching attempts retain the reference text and provenance label.
  update sessions set data=jsonb_set(data,'{provenance,lessonId}','null'::jsonb)
    where owner=p_actor and data->'provenance'->>'lessonId'=p_id::text;
  update topics set provenance=jsonb_set(provenance,'{lessonId}','null'::jsonb)
    where 'user:'||user_id::text=p_actor and lesson_id=p_id;
  delete from operations where actor=p_actor and key<>p_key and (
    resource='learn:'||p_id::text or result->'learning'->>'id'=p_id::text
    or result->'topic'->'provenance'->>'lessonId'=p_id::text
    or result->'session'->'provenance'->>'lessonId'=p_id::text
  );
  delete from learning_sessions where id=p_id;
  perform commit_operation(p_actor,p_key,'{"deleted":true}',null);
  return '{"deleted":true}'::jsonb;
end $$;

revoke all on function public.save_teacher_operation(text,uuid,jsonb,integer,jsonb,boolean,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.reserve_teacher_usage(uuid,uuid,text,text,integer,integer,integer) from public,anon,authenticated;
revoke all on function public.delete_teacher_operation(text,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.save_teacher_operation(text,uuid,jsonb,integer,jsonb,boolean,jsonb,jsonb) to service_role;
grant execute on function public.reserve_teacher_usage(uuid,uuid,text,text,integer,integer,integer) to service_role;
grant execute on function public.delete_teacher_operation(text,uuid,uuid,integer) to service_role;
