-- Energle: the devices a player uses, so each one can show "On 2 devices: this Mac, an iPhone".
-- A device is a random id kept in that browser, with a plain label ("iPhone · Safari") and when it was last seen.
-- Nobody reads the table directly: touch_device records the calling device under the key it is given and returns
-- that key's devices. The key is the player's secret, so only their own devices can see the list.

create table if not exists public.player_devices (
  player_key  text        not null,
  device_id   text        not null,
  label       text,
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  primary key (player_key, device_id)
);
alter table public.player_devices enable row level security;
revoke all on public.player_devices from anon, authenticated;

create or replace function public.touch_device(p_key text, p_device text, p_label text)
returns table (device_id text, label text, last_seen timestamptz)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
begin
  if p_key is null or p_key !~ '^[0-9a-f]{32,64}$' or p_device is null or p_device !~ '^[0-9a-f]{16,64}$' then return; end if;
  -- a device that moved to another key (linked) leaves its old one
  delete from player_devices d where d.device_id = p_device and d.player_key <> p_key;
  insert into player_devices as d (player_key, device_id, label)
  values (p_key, p_device, left(coalesce(p_label, ''), 40))
  on conflict (player_key, device_id) do update set label = excluded.label, last_seen = now();
  return query select d.device_id, d.label, d.last_seen from player_devices d
    where d.player_key = p_key order by d.last_seen desc limit 10;
end $$;

revoke all on function public.touch_device(text, text, text) from public;
grant execute on function public.touch_device(text, text, text) to anon, authenticated;
