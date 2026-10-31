create table if not exists public.trade_offer_dismissals (
  id bigint generated always as identity primary key,
  trade_offer_id bigint not null references public.trade_offers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  dismissed_at timestamptz not null default now(),
  constraint trade_offer_dismissals_offer_user_key unique (trade_offer_id, user_id)
);

create index if not exists trade_offer_dismissals_user_id_idx
  on public.trade_offer_dismissals (user_id);

create index if not exists trade_offer_dismissals_trade_offer_id_idx
  on public.trade_offer_dismissals (trade_offer_id);

alter table public.trade_offer_dismissals enable row level security;

drop policy if exists "Users and admins can read trade offer dismissals"
  on public.trade_offer_dismissals;

create policy "Users and admins can read trade offer dismissals"
  on public.trade_offer_dismissals
  for select
  to authenticated
  using (auth.uid() = user_id or public.is_admin());

drop policy if exists "Users can dismiss their trade offers"
  on public.trade_offer_dismissals;

create policy "Users can dismiss their trade offers"
  on public.trade_offer_dismissals
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.trade_offers
      where trade_offers.id = trade_offer_dismissals.trade_offer_id
        and (
          public.is_admin()
          or public.user_controls_team(trade_offers.from_team_id, trade_offers.season_year)
          or public.user_controls_team(trade_offers.to_team_id, trade_offers.season_year)
        )
    )
  );

drop policy if exists "Users can update their trade offer dismissals"
  on public.trade_offer_dismissals;

create policy "Users can update their trade offer dismissals"
  on public.trade_offer_dismissals
  for update
  to authenticated
  using (auth.uid() = user_id or public.is_admin())
  with check (auth.uid() = user_id or public.is_admin());

drop policy if exists "Users can delete their trade offer dismissals"
  on public.trade_offer_dismissals;

create policy "Users can delete their trade offer dismissals"
  on public.trade_offer_dismissals
  for delete
  to authenticated
  using (auth.uid() = user_id or public.is_admin());
