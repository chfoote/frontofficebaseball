create or replace function public.move_remaining_contract_seasons_on_trade()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    update public.player_seasons future_season
    set fantasy_team_id = trade_player.to_team_id
    from public.trade_offer_players trade_player
    join public.player_seasons selected_season
      on selected_season.id = trade_player.player_season_id
    where trade_player.trade_offer_id = new.id
      and future_season.player_id = selected_season.player_id
      and future_season.season_year >= new.season_year
      and future_season.season_year <= coalesce(
        selected_season.term_end_year,
        new.season_year
      )
      and future_season.fantasy_team_id = trade_player.from_team_id;
  end if;

  return new;
end;
$$;

create trigger move_remaining_contract_seasons_after_trade_completion
  after update of status on public.trade_offers
  for each row
  execute function public.move_remaining_contract_seasons_on_trade();
