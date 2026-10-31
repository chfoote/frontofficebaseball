-- Transfer primary league administration from Charles's personal account
-- to the dedicated GLDHL administration account.
-- Leave the current administrator untouched if the replacement Auth user does
-- not exist. Auth users cannot be created safely from a database migration.

do $$
declare
  new_admin_id uuid;
begin
  select id into new_admin_id
  from auth.users
  where lower(email) = 'sales@sg-print.com'
  limit 1;

  if new_admin_id is null then
    raise notice 'Skipping admin transfer: sales@sg-print.com does not exist in Auth.';
    return;
  end if;

  insert into public.profiles (id, email, is_admin)
  values (new_admin_id, 'sales@sg-print.com', true)
  on conflict (id) do update
  set email = excluded.email,
      is_admin = true;

  update public.profiles
  set is_admin = false
  where lower(email) = 'charlesfoote13@gmail.com'
    and id <> new_admin_id;
end;
$$;
