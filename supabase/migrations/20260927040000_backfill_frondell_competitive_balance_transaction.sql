do $$
declare
  draft_pick public.competitive_balance_draft_picks;
  posted_transaction_id bigint;
begin
  select pick.* into draft_pick
  from public.competitive_balance_draft_picks pick
  join public.players player on player.id = pick.player_id
  where pick.draft_season = 2027
    and pick.round = 1
    and pick.pick_in_round = 1
    and player.player_api_id = '8485391'
    and player.full_name = 'Anton Frondell'
  for update of pick;

  if draft_pick.id is not null and draft_pick.transaction_id is null then
    insert into public.league_transactions (
      player_season_id, player_id, fantasy_team_id, transaction_type, action,
      transaction_date, season_year, salary, term_end_year, contract_group,
      position, notes
    ) values (
      draft_pick.player_season_id,
      draft_pick.player_id,
      draft_pick.fantasy_team_id,
      'draft',
      'competitive_balance_drafted',
      current_date,
      draft_pick.draft_season,
      null,
      null,
      'COMP_BALANCE',
      'AP',
      'Selected Round 1, Pick 1 (#1 overall) in the 2027 Competitive Balance Draft.'
    ) returning id into posted_transaction_id;

    update public.competitive_balance_draft_picks
    set transaction_id = posted_transaction_id
    where id = draft_pick.id;
  end if;
end;
$$;
