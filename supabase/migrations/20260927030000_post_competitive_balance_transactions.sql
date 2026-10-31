alter table public.league_transactions
  drop constraint if exists league_transactions_type_check;

alter table public.league_transactions
  add constraint league_transactions_type_check check (
    transaction_type in ('signing', 'extension', 'trade', 'waiver', 'release', 'draft')
  );

alter table public.league_transactions
  drop constraint if exists league_transactions_action_check;

alter table public.league_transactions
  add constraint league_transactions_action_check check (
    action in (
      'signed', 'called_up', 'waived', 'claimed', 'bought_out', 'retained',
      'injured_reserve', 'long_term_injured_reserve', 'released_to_rfa_offer',
      'matched_rfa_offer', 'competitive_balance_drafted', 'traded'
    )
  );

alter table public.competitive_balance_draft_picks
  add column transaction_id bigint references public.league_transactions(id) on delete set null;

create or replace function public.sync_competitive_balance_transaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  posted_transaction_id bigint;
begin
  if old.player_id is null and new.player_id is not null then
    insert into public.league_transactions (
      player_season_id, player_id, fantasy_team_id, transaction_type, action,
      transaction_date, season_year, salary, term_end_year, contract_group,
      position, notes
    ) values (
      new.player_season_id, new.player_id, new.fantasy_team_id, 'draft',
      'competitive_balance_drafted', current_date, new.draft_season, null, null,
      'COMP_BALANCE', 'AP',
      'Competitive Balance Draft · Round ' || new.round || ', Pick ' || new.pick_in_round || ' (#' || new.overall_pick || ' overall)'
    ) returning id into posted_transaction_id;

    update public.competitive_balance_draft_picks
    set transaction_id = posted_transaction_id
    where id = new.id;
  elsif old.player_id is not null and new.player_id is null and old.transaction_id is not null then
    delete from public.league_transactions where id = old.transaction_id;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_competitive_balance_transaction on public.competitive_balance_draft_picks;
create trigger sync_competitive_balance_transaction
  after update of player_id on public.competitive_balance_draft_picks
  for each row execute function public.sync_competitive_balance_transaction();

create or replace function public.post_league_transaction_to_chat()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_id uuid;
  admin_name text;
  player_name text;
  team_name text;
  action_text text;
  chat_text text;
  chat_link text;
begin
  select p.id, coalesce(nullif(trim(p.display_name), ''), p.email, 'GLDHL Admin')
  into admin_id, admin_name
  from public.profiles p
  where lower(p.email) = 'sales@sg-print.com' and p.is_admin = true
  limit 1;
  if admin_id is null then return new; end if;

  if new.trade_offer_id is not null then
    chat_text := 'A new trade has been approved and posted.';
    chat_link := '/transactions#trade-' || new.trade_offer_id;
  else
    select coalesce(p.full_name, trim(concat_ws(' ', p.first_name, p.last_name)), 'a player')
    into player_name from public.players p where p.id = new.player_id;

    select coalesce(b.team_name, t.team_name, 'A team')
    into team_name
    from public.fantasy_teams t
    left join lateral (
      select h.team_name from public.fantasy_team_branding_history h
      where h.fantasy_team_id = t.id
        and h.start_season <= new.season_year
        and (h.end_season is null or h.end_season >= new.season_year)
      order by h.start_season desc limit 1
    ) b on true
    where t.id = new.fantasy_team_id;

    action_text := case new.action
      when 'signed' then 'signed'
      when 'called_up' then 'called up'
      when 'waived' then 'waived'
      when 'claimed' then 'claimed'
      when 'bought_out' then 'bought out'
      when 'retained' then 'retained'
      when 'injured_reserve' then 'assigned to Injured Reserve'
      when 'long_term_injured_reserve' then 'assigned to Long Term Injured Reserve'
      when 'released_to_rfa_offer' then 'released to an RFA offer'
      when 'matched_rfa_offer' then 'matched an RFA offer for'
      when 'competitive_balance_drafted' then 'selected'
      when 'traded' then 'acquired via trade'
      else 'updated'
    end;

    chat_text := coalesce(team_name, 'A team') || ' have ' || action_text || ' '
      || case when new.action = 'competitive_balance_drafted' then '' when new.position is not null then upper(new.position) || ' ' else '' end
      || coalesce(nullif(player_name, ''), 'a player')
      || case when new.action = 'competitive_balance_drafted' then ' in the Competitive Balance Draft' else '' end
      || '.';
    chat_link := '/transactions';
  end if;

  begin
    perform set_config('app.system_chat', 'true', true);
    insert into public.chat_messages (user_id, message, author_name, is_system, link)
    values (admin_id, chat_text, admin_name, true, chat_link);
  exception when others then
    raise warning 'Unable to post transaction % to league chat: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;
