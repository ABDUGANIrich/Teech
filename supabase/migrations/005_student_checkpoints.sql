-- Apply after 004. Persist Pip's submitted writing before external AI work,
-- while retaining the existing operation lease and final atomic commit.
create function public.checkpoint_session_operation(p_actor text,p_key uuid,p_session jsonb)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare op public.operations; row public.sessions; target uuid := (p_session->>'id')::uuid;
begin
  select * into op from operations where actor=p_actor and key=p_key for update;
  if not found or op.state<>'processing' or op.resource<>'session:'||target::text then
    raise exception 'REQUEST_NOT_ACTIVE';
  end if;
  select * into row from sessions where id=target for update;
  if not found or row.owner<>p_actor or p_session->>'owner' is distinct from p_actor then
    raise exception 'FORBIDDEN';
  end if;
  -- A checkpoint cannot change the immutable source, identity or practice conditions.
  if (p_session - array['messages','phase','question_calls','evaluation'])
    is distinct from (row.data - array['messages','phase','question_calls','evaluation']) then
    raise exception 'INVALID_CHECKPOINT';
  end if;
  update sessions set data=p_session where id=target;
end $$;
revoke all on function public.checkpoint_session_operation(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.checkpoint_session_operation(text,uuid,jsonb) to service_role;
