alter table public.league_transactions
  add column if not exists related_trade_offer_id bigint
    references public.trade_offers(id) on delete set null;

create index if not exists league_transactions_related_trade_offer_id_idx
  on public.league_transactions(related_trade_offer_id);
