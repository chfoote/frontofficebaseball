do $$
declare
  matching_transaction_id bigint;
  matching_count integer;
begin
  select count(*), min(transaction.id)
  into matching_count, matching_transaction_id
  from public.league_transactions transaction
  join public.players player on player.id = transaction.player_id
  join public.fantasy_teams team on team.id = transaction.fantasy_team_id
  where transaction.action = 'traded'
    and lower(coalesce(player.full_name, trim(concat_ws(' ', player.first_name, player.last_name))))
      = 'vasily podkolzin'
    and lower(team.team_name) like '%shithawk%';

  if matching_count = 0 then
    raise notice 'Skipping Podkolzin Discord repost: the legacy transaction is not present.';
    return;
  elsif matching_count <> 1 then
    raise exception 'Expected exactly one Podkolzin-to-Shithawks transaction, found %.', matching_count;
  end if;

  update public.discord_transaction_deliveries
  set status = 'queued',
      attempt_count = 0,
      next_attempt_at = now(),
      discord_message_id = null,
      last_error = null,
      sent_at = null,
      updated_at = now()
  where transaction_id = matching_transaction_id;

  if not found then
    raise exception 'Discord delivery record was not found for transaction %.', matching_transaction_id;
  end if;
end;
$$;
