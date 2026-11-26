-- Energle: a result is saved only by the browser that holds the name (26 Nov 2026).
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.

create or replace function public.submit_score(p_username text, p_day integer, p_guesses integer, p_won boolean, p_key text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  c text;
begin
  if p_username is null or length(trim(p_username)) < 2 or p_key is null or length(p_key) < 32 then
    return 'bad';
  end if;
  -- the same check the rename window uses: claims a free name for this browser, 'other' if another browser holds it
  execute format('select public.claim_name(%L, %L)::text', p_username, p_key) into c;
  if c = 'other' then return 'taken'; end if;
  if c is distinct from 'mine' then return 'bad'; end if;
  if exists (select 1 from public.scores where username = p_username and day = p_day) then
    return 'dup';
  end if;
  begin
    insert into public.scores (username, day, guesses, won) values (p_username, p_day, p_guesses, p_won);
  exception when unique_violation then
    return 'dup';
  end;
  return 'ok';
end
$$;

revoke all on function public.submit_score(text, integer, integer, boolean, text) from public;
grant execute on function public.submit_score(text, integer, integer, boolean, text) to anon, authenticated;

-- From now on submit_score is the only way in: browsers can no longer add rows to scores directly.
revoke insert on public.scores from anon, authenticated;
