alter table public.trade_offers
  add column if not exists to_team_accepted_at timestamptz,
  add column if not exists third_team_accepted_at timestamptz;

create or replace function public.create_three_team_trade_offer(
  p_season_year integer,
  p_team_1_id bigint,
  p_team_2_id bigint,
  p_team_3_id bigint,
  p_notes text,
  p_player_moves jsonb
)
returns public.trade_offers
language plpgsql
security definer
set search_path = public
as $$
declare
  offer public.trade_offers;
  move jsonb;
begin
  if not public.user_controls_team(p_team_1_id, p_season_year) then
    raise exception 'You can only propose a trade from your assigned team.';
  end if;
  if p_team_1_id = p_team_2_id or p_team_1_id = p_team_3_id or p_team_2_id = p_team_3_id then
    raise exception 'A three-team trade requires three different teams.';
  end if;
  if jsonb_array_length(coalesce(p_player_moves, '[]'::jsonb)) = 0
     and coalesce(trim(p_notes), '') = '' then
    raise exception 'Select at least one player or add trade notes.';
  end if;

  insert into public.trade_offers (
    season_year, from_team_id, to_team_id, third_team_id,
    created_by, status, notes
  ) values (
    p_season_year, p_team_1_id, p_team_2_id, p_team_3_id,
    auth.uid(), 'pending', nullif(trim(p_notes), '')
  ) returning * into offer;

  for move in select * from jsonb_array_elements(coalesce(p_player_moves, '[]'::jsonb))
  loop
    insert into public.trade_offer_players (
      trade_offer_id, player_season_id, from_team_id, to_team_id
    ) values (
      offer.id,
      (move->>'playerSeasonId')::bigint,
      (move->>'fromTeamId')::bigint,
      (move->>'toTeamId')::bigint
    );
  end loop;

  return offer;
end;
$$;

create or replace function public.respond_to_three_team_trade_offer(
  p_trade_offer_id bigint,
  p_accept boolean
)
returns public.trade_offers
language plpgsql
security definer
set search_path = public
as $$
declare
  offer public.trade_offers;
  controls_second boolean;
  controls_third boolean;
begin
  select * into offer from public.trade_offers where id = p_trade_offer_id for update;
  if not found or offer.third_team_id is null then raise exception 'Three-team trade offer not found.'; end if;
  if offer.status <> 'pending' then raise exception 'This trade offer is no longer pending.'; end if;

  controls_second := public.user_controls_team(offer.to_team_id, offer.season_year);
  controls_third := public.user_controls_team(offer.third_team_id, offer.season_year);
  if not controls_second and not controls_third then raise exception 'Only a receiving team can respond to this offer.'; end if;

  if not p_accept then
    update public.trade_offers set status = 'declined', declined_at = now() where id = offer.id returning * into offer;
    return offer;
  end if;

  update public.trade_offers
  set to_team_accepted_at = case when controls_second then now() else to_team_accepted_at end,
      third_team_accepted_at = case when controls_third then now() else third_team_accepted_at end
  where id = offer.id
  returning * into offer;

  if offer.to_team_accepted_at is not null and offer.third_team_accepted_at is not null then
    update public.trade_offers set status = 'accepted', accepted_at = now() where id = offer.id returning * into offer;
  end if;
  return offer;
end;
$$;

grant execute on function public.create_three_team_trade_offer(integer, bigint, bigint, bigint, text, jsonb) to authenticated;
grant execute on function public.respond_to_three_team_trade_offer(bigint, boolean) to authenticated;

drop policy if exists "Trade participants and admins can read offers" on public.trade_offers;
create policy "Trade participants and admins can read offers" on public.trade_offers
  for select to authenticated using (
    public.is_admin()
    or public.user_controls_team(from_team_id, season_year)
    or public.user_controls_team(to_team_id, season_year)
    or public.user_controls_team(third_team_id, season_year)
  );

drop policy if exists "Trade participants and admins can read offer players" on public.trade_offer_players;
create policy "Trade participants and admins can read offer players" on public.trade_offer_players
  for select to authenticated using (
    exists (
      select 1 from public.trade_offers
      where trade_offers.id = trade_offer_players.trade_offer_id
        and (
          public.is_admin()
          or public.user_controls_team(trade_offers.from_team_id, trade_offers.season_year)
          or public.user_controls_team(trade_offers.to_team_id, trade_offers.season_year)
          or public.user_controls_team(trade_offers.third_team_id, trade_offers.season_year)
        )
    )
  );
