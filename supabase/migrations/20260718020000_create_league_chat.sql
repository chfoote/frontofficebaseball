create table if not exists public.chat_messages (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  message text not null,
  author_name text not null,
  fantasy_team_id bigint references public.fantasy_teams(id) on delete set null,
  team_name text,
  team_abbreviation text,
  team_logo text,
  created_at timestamptz not null default now(),
  constraint chat_messages_length_check check (
    char_length(trim(message)) between 1 and 250
  )
);

create index if not exists chat_messages_created_at_idx
  on public.chat_messages (created_at desc);

alter table public.chat_messages enable row level security;

create policy "Authenticated users can read league chat"
  on public.chat_messages for select to authenticated using (true);

create policy "Authenticated users can send league chat messages"
  on public.chat_messages for insert to authenticated
  with check (auth.uid() = user_id);

create policy "Admins can delete league chat messages"
  on public.chat_messages for delete to authenticated
  using (public.is_admin());

create or replace function public.prepare_chat_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  sender_id uuid;
begin
  sender_id := auth.uid();
  if sender_id is null then raise exception 'You must be signed in to send a message.'; end if;

  new.user_id := sender_id;
  new.message := trim(new.message);

  select coalesce(nullif(trim(p.display_name), ''), p.email, 'League member')
  into new.author_name
  from public.profiles p
  where p.id = sender_id;

  new.author_name := coalesce(new.author_name, 'League member');

  select
    t.id,
    coalesce(b.team_name, t.team_name),
    coalesce(b.abbreviation, t.abbreviation),
    coalesce(b.logo, t.logo)
  into new.fantasy_team_id, new.team_name, new.team_abbreviation, new.team_logo
  from public.team_user_assignments a
  join public.fantasy_teams t on t.id = a.fantasy_team_id
  left join lateral (
    select h.team_name, h.abbreviation, h.logo
    from public.fantasy_team_branding_history h
    where h.fantasy_team_id = t.id
      and h.start_season <= a.season_year
      and (h.end_season is null or h.end_season >= a.season_year)
    order by h.start_season desc
    limit 1
  ) b on true
  where a.user_id = sender_id
  order by a.season_year desc
  limit 1;

  return new;
end;
$$;

drop trigger if exists prepare_chat_message on public.chat_messages;
create trigger prepare_chat_message
  before insert on public.chat_messages
  for each row execute function public.prepare_chat_message();

alter table public.chat_messages replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'chat_messages'
    ) then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end;
$$;
