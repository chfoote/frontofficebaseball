create or replace function public.create_admin_trade_offer(
  p_season_year integer,
  p_from_team_id bigint,
  p_to_team_id bigint,
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
  if not public.is_admin() then
    raise exception 'Only admins can submit agreed trades.';
  end if;
  if p_from_team_id = p_to_team_id then
    raise exception 'A trade requires two different teams.';
  end if;
  if jsonb_array_length(coalesce(p_player_moves, '[]'::jsonb)) = 0
     and coalesce(trim(p_notes), '') = '' then
    raise exception 'Select at least one player or add trade notes.';
  end if;

  insert into public.trade_offers (
    season_year, from_team_id, to_team_id, created_by, status, notes, accepted_at
  ) values (
    p_season_year, p_from_team_id, p_to_team_id, auth.uid(), 'accepted', nullif(trim(p_notes), ''), now()
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

grant execute on function public.create_admin_trade_offer(integer, bigint, bigint, text, jsonb)
  to authenticated;
