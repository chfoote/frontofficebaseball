drop function if exists public.process_contract_retention(bigint, bigint, date, integer, text);

alter table public.contract_retentions
  drop constraint if exists contract_retentions_retention_percentage_check;

alter table public.contract_retentions
  alter column retention_percentage type numeric(5,2) using retention_percentage::numeric;

alter table public.contract_retentions
  alter column retention_percentage drop default;

alter table public.contract_retentions
  add constraint contract_retentions_retention_percentage_check
  check (retention_percentage > 0 and retention_percentage <= 25);

create or replace function public.process_contract_retention(
  p_trade_offer_id bigint,
  p_player_season_id bigint,
  p_retention_date date,
  p_first_season_year integer,
  p_retained_amount integer,
  p_notes text default null
)
returns public.contract_retentions
language plpgsql
security definer
set search_path = public
as $$
declare
  source_season public.player_seasons;
  trade_player public.trade_offer_players;
  trade_record public.trade_offers;
  retention_record public.contract_retentions;
  maximum_retained_amount integer;
  retained_percentage numeric(5,2);
  year_value integer;
begin
  if not public.is_admin() then raise exception 'Administrator access is required.'; end if;
  select * into trade_record from public.trade_offers where id = p_trade_offer_id;
  if not found or trade_record.status <> 'completed' then raise exception 'Choose a completed trade.'; end if;
  select * into trade_player from public.trade_offer_players where trade_offer_id = p_trade_offer_id and player_season_id = p_player_season_id;
  if not found then raise exception 'The selected player is not part of that trade.'; end if;
  select * into source_season from public.player_seasons where id = p_player_season_id;
  if not found or source_season.salary is null or source_season.term_end_year is null then raise exception 'The player needs a valid AAV and contract end year.'; end if;
  if p_first_season_year < trade_record.season_year or p_first_season_year > source_season.term_end_year then raise exception 'The first retention season is outside the contract term.'; end if;
  maximum_retained_amount := round(source_season.salary * 0.25);
  if p_retained_amount <= 0 or p_retained_amount > maximum_retained_amount then
    raise exception 'The retained amount must be greater than zero and no more than 25%% of the player AAV (%).', maximum_retained_amount;
  end if;
  retained_percentage := round((p_retained_amount::numeric * 10000 / source_season.salary)::numeric) / 100;
  insert into public.contract_retentions (
    player_id, source_player_season_id, trade_offer_id, retaining_team_id, receiving_team_id,
    retention_percentage, original_aav, annual_retained_amount, first_season_year, term_end_year,
    retention_date, notes, created_by
  ) values (
    source_season.player_id, source_season.id, trade_record.id, trade_player.from_team_id, trade_player.to_team_id,
    retained_percentage, source_season.salary, p_retained_amount, p_first_season_year, source_season.term_end_year,
    p_retention_date, nullif(trim(p_notes), ''), auth.uid()
  ) returning * into retention_record;
  for year_value in p_first_season_year..source_season.term_end_year loop
    insert into public.retention_cap_adjustments (retention_id, fantasy_team_id, player_id, season_year, adjustment_type, amount)
    values (retention_record.id, trade_player.from_team_id, source_season.player_id, year_value, 'charge', p_retained_amount);
    insert into public.retention_cap_adjustments (retention_id, fantasy_team_id, player_id, season_year, adjustment_type, amount)
    values (retention_record.id, trade_player.to_team_id, source_season.player_id, year_value, 'relief', -p_retained_amount);
  end loop;
  return retention_record;
end;
$$;

grant execute on function public.process_contract_retention(bigint, bigint, date, integer, integer, text) to authenticated;
