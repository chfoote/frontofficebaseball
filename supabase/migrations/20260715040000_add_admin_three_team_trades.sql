alter table public.trade_offers
  add column if not exists third_team_id bigint
    references public.fantasy_teams(id) on delete restrict;

alter table public.trade_offers
  drop constraint if exists trade_offers_distinct_third_team_check;

alter table public.trade_offers
  add constraint trade_offers_distinct_third_team_check check (
    third_team_id is null
    or (third_team_id <> from_team_id and third_team_id <> to_team_id)
  );

create or replace function public.validate_trade_offer_player()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  offer public.trade_offers;
  player_team_id bigint;
begin
  select * into offer
  from public.trade_offers
  where id = new.trade_offer_id;

  if not found then
    raise exception 'Trade offer not found.';
  end if;

  if new.from_team_id not in (offer.from_team_id, offer.to_team_id, coalesce(offer.third_team_id, -1))
     or new.to_team_id not in (offer.from_team_id, offer.to_team_id, coalesce(offer.third_team_id, -1))
     or new.from_team_id = new.to_team_id then
    raise exception 'Trade player source and destination must be participating teams.';
  end if;

  select fantasy_team_id into player_team_id
  from public.player_seasons
  where id = new.player_season_id
    and season_year = offer.season_year;

  if player_team_id is distinct from new.from_team_id then
    raise exception 'Player does not belong to the listed source team for this season.';
  end if;

  return new;
end;
$$;

create or replace function public.create_admin_three_team_trade(
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
  if not public.is_admin() then
    raise exception 'Only admins can submit three-team trades.';
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
    created_by, status, notes, accepted_at
  ) values (
    p_season_year, p_team_1_id, p_team_2_id, p_team_3_id,
    auth.uid(), 'accepted', nullif(trim(p_notes), ''), now()
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

grant execute on function public.create_admin_three_team_trade(integer, bigint, bigint, bigint, text, jsonb)
  to authenticated;
