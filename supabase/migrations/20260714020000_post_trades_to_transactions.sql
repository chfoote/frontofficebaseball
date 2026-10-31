alter table public.league_transactions
  add column trade_offer_id bigint unique references public.trade_offers(id) on delete set null,
  add column description text;

create or replace function public.approve_trade_offer_with_date(
  p_trade_offer_id bigint,
  p_transaction_date date
)
returns public.trade_offers
language plpgsql
security definer
set search_path = public
as $$
declare
  offer public.trade_offers;
  trade_description text;
begin
  if not public.is_admin() then
    raise exception 'Only admins can approve trades.';
  end if;

  if p_transaction_date is null then
    raise exception 'A transaction date is required.';
  end if;

  select * into offer
  from public.trade_offers
  where id = p_trade_offer_id
  for update;

  if not found then
    raise exception 'Trade offer not found.';
  end if;

  if offer.status <> 'accepted' then
    raise exception 'Only accepted trades can be completed.';
  end if;

  select string_agg(
    coalesce(players.full_name, trim(concat(players.first_name, ' ', players.last_name)), 'Unknown player')
      || ' to ' || destination.team_name,
    ', ' order by trade_offer_players.id
  )
  into trade_description
  from public.trade_offer_players
  join public.player_seasons on player_seasons.id = trade_offer_players.player_season_id
  join public.players on players.id = player_seasons.player_id
  join public.fantasy_teams destination on destination.id = trade_offer_players.to_team_id
  where trade_offer_players.trade_offer_id = offer.id;

  update public.player_seasons
  set fantasy_team_id = trade_offer_players.to_team_id
  from public.trade_offer_players
  where trade_offer_players.trade_offer_id = offer.id
    and player_seasons.id = trade_offer_players.player_season_id;

  update public.trade_offers
  set status = 'completed', completed_at = now(), admin_reviewed_at = now()
  where id = offer.id
  returning * into offer;

  insert into public.league_transactions (
    trade_offer_id,
    fantasy_team_id,
    transaction_type,
    transaction_date,
    season_year,
    notes,
    description
  ) values (
    offer.id,
    offer.from_team_id,
    'trade',
    p_transaction_date,
    offer.season_year,
    offer.notes,
    trade_description
  );

  return offer;
end;
$$;

grant execute on function public.approve_trade_offer_with_date(bigint, date)
  to authenticated;
