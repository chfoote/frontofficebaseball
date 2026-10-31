create or replace function public.get_gm_trade_offer_activity()
returns table (
  created_by uuid,
  from_team_id bigint,
  season_year integer,
  status text,
  is_counter boolean,
  offer_count bigint
)
language sql
security definer
set search_path = public
stable
as $$
  select
    offers.created_by,
    offers.from_team_id,
    offers.season_year,
    offers.status,
    offers.parent_trade_offer_id is not null,
    count(*)
  from public.trade_offers offers
  where auth.uid() is not null
  group by
    offers.created_by,
    offers.from_team_id,
    offers.season_year,
    offers.status,
    offers.parent_trade_offer_id is not null;
$$;

revoke all on function public.get_gm_trade_offer_activity() from public;
grant execute on function public.get_gm_trade_offer_activity() to authenticated;

comment on function public.get_gm_trade_offer_activity() is
  'Returns non-sensitive aggregate offer counts for authenticated GM profiles without exposing private offer contents.';
