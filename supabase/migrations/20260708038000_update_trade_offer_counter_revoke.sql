alter table public.trade_offers
  add column if not exists revoked_at timestamptz;

alter table public.trade_offers
  drop constraint if exists trade_offers_status_check;

alter table public.trade_offers
  add constraint trade_offers_status_check check (
    status in (
      'pending',
      'accepted',
      'declined',
      'admin_declined',
      'completed',
      'countered',
      'revoked'
    )
  );

drop policy if exists "Trade recipients and admins can update offers"
  on public.trade_offers;

drop policy if exists "Trade participants and admins can update offers"
  on public.trade_offers;

create policy "Trade participants and admins can update offers"
  on public.trade_offers
  for update
  to authenticated
  using (
    public.is_admin()
    or public.user_controls_team(from_team_id, season_year)
    or public.user_controls_team(to_team_id, season_year)
  )
  with check (
    public.is_admin()
    or public.user_controls_team(from_team_id, season_year)
    or public.user_controls_team(to_team_id, season_year)
  );
