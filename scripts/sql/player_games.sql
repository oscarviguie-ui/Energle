-- Energle: a player's games, shared between their linked devices.
-- Each row is one puzzle (daily or archive) for one player key: the guesses in order, the clue cards bought, and
-- whether it is finished. Nobody reads the table directly (RLS on, no grants): the two functions below read and write
-- only the rows of the key they are given, and a key is a 32-character secret held by that player's devices.
-- So no other player can see anyone's guesses (or today's answer through them).

create table if not exists public.player_games (
  player_key  text        not null,
  day         integer     not null,
  src         text        not null default 'daily',
  guesses     text[]      not null default '{}',
  cards       jsonb,
  done        boolean     not null default false,
  updated_at  timestamptz not null default now(),
  primary key (player_key, day)
);
alter table public.player_games enable row level security;
revoke all on public.player_games from anon, authenticated;

-- write: a finished game is never overwritten, and a game never loses guesses
create or replace function public.save_game(p_key text, p_day integer, p_src text, p_guesses text[], p_cards jsonb, p_done boolean)
returns text language plpgsql security definer set search_path = public as $$
begin
  if p_key is null or p_key !~ '^[0-9a-f]{32,64}$' or p_day is null or p_day < 1 or p_day > 100000
     or coalesce(array_length(p_guesses, 1), 0) > 12 or p_src not in ('daily', 'archive')
     or pg_column_size(p_cards) > 8000 then
    return 'bad';
  end if;
  insert into player_games as g (player_key, day, src, guesses, cards, done)
  values (p_key, p_day, p_src, coalesce(p_guesses, '{}'), p_cards, coalesce(p_done, false))
  on conflict (player_key, day) do update
    set guesses = excluded.guesses, cards = excluded.cards, done = excluded.done, src = excluded.src, updated_at = now()
    where not g.done
      and coalesce(array_length(excluded.guesses, 1), 0) >= coalesce(array_length(g.guesses, 1), 0);
  return 'ok';
end $$;

-- read: this key's games from a given day on
create or replace function public.load_games(p_key text, p_from integer)
returns table (day integer, src text, guesses text[], cards jsonb, done boolean)
language sql security definer set search_path = public stable as $$
  select g.day, g.src, g.guesses, g.cards, g.done from player_games g
  where p_key ~ '^[0-9a-f]{32,64}$' and g.player_key = p_key and g.day >= coalesce(p_from, 1)
  order by g.day
$$;

revoke all on function public.save_game(text, integer, text, text[], jsonb, boolean) from public;
revoke all on function public.load_games(text, integer) from public;
grant execute on function public.save_game(text, integer, text, text[], jsonb, boolean) to anon, authenticated;
grant execute on function public.load_games(text, integer) to anon, authenticated;
