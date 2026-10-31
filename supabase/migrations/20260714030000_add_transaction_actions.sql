alter table public.league_transactions
  add column action text not null default 'signed';

alter table public.league_transactions
  add constraint league_transactions_action_check check (
    action in (
      'signed',
      'called_up',
      'waived',
      'bought_out',
      'retained',
      'injured_reserve',
      'long_term_injured_reserve',
      'released_to_rfa_offer',
      'matched_rfa_offer',
      'traded'
    )
  );

update public.league_transactions
set action = 'traded'
where transaction_type = 'trade';

create or replace function public.set_league_transaction_action()
returns trigger
language plpgsql
as $$
begin
  if new.transaction_type = 'trade' and new.trade_offer_id is not null then
    new.action = 'traded';
  end if;
  return new;
end;
$$;

create trigger set_league_transaction_action_before_insert
  before insert on public.league_transactions
  for each row execute function public.set_league_transaction_action();
