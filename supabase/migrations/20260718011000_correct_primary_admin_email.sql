-- Correct the dedicated admin address from .ca to .com.
-- This remains safe whether or not the preceding transfer migration ran remotely.

do $$
declare
  new_admin_id uuid;
begin
  select id into new_admin_id
  from auth.users
  where lower(email) = 'sales@sg-print.com'
  limit 1;

  if new_admin_id is null then
    raise notice 'Skipping admin email correction: sales@sg-print.com does not exist in Auth.';
    return;
  end if;

  insert into public.profiles (id, email, is_admin)
  values (new_admin_id, 'sales@sg-print.com', true)
  on conflict (id) do update
  set email = excluded.email,
      is_admin = true;

  update public.profiles
  set is_admin = false
  where lower(email) in ('charlesfoote13@gmail.com', 'sales@sg-print.ca')
    and id <> new_admin_id;
end;
$$;
