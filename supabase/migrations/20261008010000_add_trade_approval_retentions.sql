drop function if exists public.approve_trade_offer_with_date(bigint, date);

create unique index if not exists contract_retentions_one_per_team_season_idx
  on public.contract_retentions (retaining_team_id, first_season_year)
  where status = 'active';

create or replace function public.approve_trade_offer_with_date(
  p_trade_offer_id bigint,
  p_transaction_date date,
  p_retentions jsonb default '[]'::jsonb
)
returns public.trade_offers
language plpgsql
security definer
set search_path = public
as $$
declare
  offer public.trade_offers;
  trade_description text;
  retention_item jsonb;
  source_season public.player_seasons;
  trade_player public.trade_offer_players;
  retention_record public.contract_retentions;
  retained_amount integer;
  maximum_retained_amount integer;
  retained_percentage numeric(5,2);
  year_value integer;
  retaining_teams bigint[] := array[]::bigint[];
begin
  if not public.is_admin() then raise exception 'Only admins can approve trades.'; end if;
  if p_transaction_date is null then raise exception 'A transaction date is required.'; end if;
  if jsonb_typeof(coalesce(p_retentions, '[]'::jsonb)) <> 'array' then raise exception 'Retentions must be an array.'; end if;

  select * into offer from public.trade_offers where id = p_trade_offer_id for update;
  if not found then raise exception 'Trade offer not found.'; end if;
  if offer.status <> 'accepted' then raise exception 'Only accepted trades can be completed.'; end if;

  for retention_item in select * from jsonb_array_elements(coalesce(p_retentions, '[]'::jsonb)) loop
    select * into trade_player
    from public.trade_offer_players
    where trade_offer_id = offer.id
      and player_season_id = (retention_item->>'player_season_id')::bigint;
    if not found then raise exception 'A retained player is not included in this trade.'; end if;

    if trade_player.from_team_id = any(retaining_teams) then
      raise exception 'A team may retain only one contract per season.';
    end if;
    if exists (
      select 1 from public.contract_retentions
      where retaining_team_id = trade_player.from_team_id
        and first_season_year = offer.season_year
        and status = 'active'
    ) then raise exception 'The retaining team has already retained a contract this season.'; end if;

    select * into source_season from public.player_seasons where id = trade_player.player_season_id;
    if not found or source_season.salary is null or source_season.salary <= 0 or source_season.term_end_year is null or source_season.term_end_year < offer.season_year then
      raise exception 'A retained player must have a valid salary and contract end year.';
    end if;
    retained_amount := (retention_item->>'retained_amount')::integer;
    maximum_retained_amount := round(source_season.salary * 0.25);
    if retained_amount <= 0 or retained_amount > maximum_retained_amount then
      raise exception 'Retained salary must be greater than zero and no more than 25%% of the player AAV (%).', maximum_retained_amount;
    end if;
    retained_percentage := round((retained_amount::numeric * 10000 / source_season.salary)::numeric) / 100;

    insert into public.contract_retentions (
      player_id, source_player_season_id, trade_offer_id, retaining_team_id, receiving_team_id,
      retention_percentage, original_aav, annual_retained_amount, first_season_year, term_end_year,
      retention_date, notes, created_by
    ) values (
      source_season.player_id, source_season.id, offer.id, trade_player.from_team_id, trade_player.to_team_id,
      retained_percentage, source_season.salary, retained_amount, offer.season_year, source_season.term_end_year,
      p_transaction_date, 'Created during trade approval.', auth.uid()
    ) returning * into retention_record;

    for year_value in offer.season_year..source_season.term_end_year loop
      insert into public.retention_cap_adjustments (retention_id, fantasy_team_id, player_id, season_year, adjustment_type, amount)
      values (retention_record.id, trade_player.from_team_id, source_season.player_id, year_value, 'charge', retained_amount);
      insert into public.retention_cap_adjustments (retention_id, fantasy_team_id, player_id, season_year, adjustment_type, amount)
      values (retention_record.id, trade_player.to_team_id, source_season.player_id, year_value, 'relief', -retained_amount);
    end loop;
    retaining_teams := array_append(retaining_teams, trade_player.from_team_id);
  end loop;

  select string_agg(
    coalesce(players.full_name, trim(concat(players.first_name, ' ', players.last_name)), 'Unknown player') || ' to ' || destination.team_name,
    ', ' order by trade_offer_players.id
  ) into trade_description
  from public.trade_offer_players
  join public.player_seasons on player_seasons.id = trade_offer_players.player_season_id
  join public.players on players.id = player_seasons.player_id
  join public.fantasy_teams destination on destination.id = trade_offer_players.to_team_id
  where trade_offer_players.trade_offer_id = offer.id;

  update public.player_seasons set fantasy_team_id = trade_offer_players.to_team_id
  from public.trade_offer_players
  where trade_offer_players.trade_offer_id = offer.id and player_seasons.id = trade_offer_players.player_season_id;

  update public.trade_offers set status = 'completed', completed_at = now(), admin_reviewed_at = now()
  where id = offer.id returning * into offer;

  insert into public.league_transactions (trade_offer_id, fantasy_team_id, transaction_type, transaction_date, season_year, notes, description)
  values (offer.id, offer.from_team_id, 'trade', p_transaction_date, offer.season_year, offer.notes, trade_description);
  return offer;
end;
$$;

grant execute on function public.approve_trade_offer_with_date(bigint, date, jsonb) to authenticated;
