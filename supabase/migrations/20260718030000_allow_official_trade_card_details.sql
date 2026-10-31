-- Official transaction cards need their completed trade and player details.
-- Keep pending, declined, countered, and revoked negotiations private.

drop policy if exists "Authenticated users can read officially posted trade offers"
  on public.trade_offers;

create policy "Authenticated users can read officially posted trade offers"
  on public.trade_offers
  for select
  to authenticated
  using (
    status = 'completed'
    and exists (
      select 1
      from public.league_transactions
      where league_transactions.trade_offer_id = trade_offers.id
    )
  );

drop policy if exists "Authenticated users can read officially posted trade players"
  on public.trade_offer_players;

create policy "Authenticated users can read officially posted trade players"
  on public.trade_offer_players
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.league_transactions
      where league_transactions.trade_offer_id = trade_offer_players.trade_offer_id
    )
  );
