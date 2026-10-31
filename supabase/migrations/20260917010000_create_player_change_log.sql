create table public.player_change_log (
  id bigint generated always as identity primary key,
  changed_at timestamptz not null default now(),
  actor_id uuid,
  actor_email text,
  table_name text not null check (table_name in ('players', 'player_seasons')),
  operation text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  row_id bigint not null,
  player_id bigint not null,
  player_name text,
  season_year integer,
  old_data jsonb,
  new_data jsonb
);

create index player_change_log_player_idx on public.player_change_log (player_id, id desc);
create index player_change_log_changed_idx on public.player_change_log (id desc);

alter table public.player_change_log enable row level security;

create policy "Admins can read player change log"
  on public.player_change_log for select to authenticated
  using (public.is_admin());

grant select on public.player_change_log to authenticated;

create or replace function public.record_player_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  before_row jsonb;
  after_row jsonb;
  changed_row jsonb;
  changed_player_id bigint;
  changed_player_name text;
begin
  if tg_op = 'UPDATE' then
    if to_jsonb(old) - 'updated_at' = to_jsonb(new) - 'updated_at' then
      return new;
    end if;
  end if;

  if tg_op <> 'INSERT' then before_row := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then after_row := to_jsonb(new); end if;
  changed_row := coalesce(after_row, before_row);

  if tg_table_name = 'players' then
    changed_player_id := (changed_row->>'id')::bigint;
    changed_player_name := coalesce(
      nullif(changed_row->>'full_name', ''),
      nullif(trim(concat_ws(' ', changed_row->>'first_name', changed_row->>'last_name')), '')
    );
  else
    changed_player_id := (changed_row->>'player_id')::bigint;
    select coalesce(nullif(p.full_name, ''), nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''))
      into changed_player_name
      from public.players p where p.id = changed_player_id;
  end if;

  insert into public.player_change_log (
    actor_id, actor_email, table_name, operation, row_id, player_id,
    player_name, season_year, old_data, new_data
  ) values (
    auth.uid(), auth.jwt()->>'email', tg_table_name, tg_op,
    (changed_row->>'id')::bigint, changed_player_id, changed_player_name,
    case when tg_table_name = 'player_seasons' then (changed_row->>'season_year')::integer else null end,
    before_row, after_row
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger record_players_changes
  after insert or update or delete on public.players
  for each row execute function public.record_player_change();

create trigger record_player_seasons_changes
  after insert or update or delete on public.player_seasons
  for each row execute function public.record_player_change();
