alter table public.league_transactions
  drop constraint league_transactions_action_check;

alter table public.league_transactions
  add constraint league_transactions_action_check check (
    action in (
      'signed',
      'called_up',
      'waived',
      'claimed',
      'bought_out',
      'retained',
      'injured_reserve',
      'long_term_injured_reserve',
      'released_to_rfa_offer',
      'matched_rfa_offer',
      'traded'
    )
  );
