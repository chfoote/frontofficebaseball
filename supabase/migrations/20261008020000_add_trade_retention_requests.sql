alter table public.trade_offer_players
  add column if not exists retention_requested boolean not null default false;

create unique index if not exists trade_offer_players_one_retention_request_per_team_idx
  on public.trade_offer_players (trade_offer_id, from_team_id)
  where retention_requested;

create or replace function public.set_trade_retention_requests(
  p_trade_offer_id bigint,
  p_player_season_ids bigint[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  offer public.trade_offers;
begin
  select * into offer from public.trade_offers where id = p_trade_offer_id for update;
  if not found then raise exception 'Trade offer not found.'; end if;
  if offer.created_by <> auth.uid() and not public.is_admin() then raise exception 'You cannot change this trade offer.'; end if;
  if offer.status not in ('pending', 'accepted') then raise exception 'Retention requests cannot be changed for this trade.'; end if;
  if exists (
    select 1 from unnest(coalesce(p_player_season_ids, array[]::bigint[])) requested_id
    left join public.trade_offer_players player on player.trade_offer_id = offer.id and player.player_season_id = requested_id
    where player.id is null
  ) then raise exception 'A retention request must reference a player in the trade.'; end if;

  update public.trade_offer_players set retention_requested = false where trade_offer_id = offer.id;
  update public.trade_offer_players set retention_requested = true
  where trade_offer_id = offer.id and player_season_id = any(coalesce(p_player_season_ids, array[]::bigint[]));
end;
$$;

grant execute on function public.set_trade_retention_requests(bigint, bigint[]) to authenticated;
