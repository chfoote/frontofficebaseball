do $$
declare
  mistaken_player_id bigint;
  existing_leonard_id bigint;
begin
  select id into mistaken_player_id
  from public.players
  where player_api_id = '8483505'
    and lower(coalesce(full_name, nullif(trim(concat(first_name, ' ', last_name)), ''))) = 'ryan leonard'
  limit 1;

  select id into existing_leonard_id
  from public.players
  where player_api_id = '8484186'
  limit 1;

  if mistaken_player_id is not null and existing_leonard_id is not null and mistaken_player_id <> existing_leonard_id then
    raise exception 'Ryan Leonard already exists separately; refusing to merge player history automatically.';
  end if;

  if mistaken_player_id is not null then
    update public.players
    set player_api_id = '8484186',
        first_name = 'Ryan',
        last_name = 'Leonard',
        full_name = 'Ryan Leonard',
        notes = 'Corrected NHL player ID from Matthew Poitras (8483505) to Ryan Leonard (8484186).',
        updated_at = now()
    where id = mistaken_player_id;
  end if;

  if not exists (
    select 1 from public.players
    where player_api_id = '8484186'
      and lower(coalesce(full_name, nullif(trim(concat(first_name, ' ', last_name)), ''))) = 'ryan leonard'
  ) then
    raise exception 'Ryan Leonard NHL ID correction failed verification.';
  end if;

  if exists (
    select 1 from public.players
    where player_api_id = '8483505'
      and lower(coalesce(full_name, nullif(trim(concat(first_name, ' ', last_name)), ''))) = 'ryan leonard'
  ) then
    raise exception 'Matthew Poitras NHL ID is still incorrectly assigned to Ryan Leonard.';
  end if;
end;
$$;
