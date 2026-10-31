-- Run once in the standalone Front Office Baseball Supabase SQL Editor.
-- This grants server-side administrator access to the initial commissioner.

do $$
declare
  admin_user_id uuid;
begin
  select id into admin_user_id
  from auth.users
  where lower(email) = 'chfoote@icloud.com'
  limit 1;

  if admin_user_id is null then
    raise exception 'Sign in as chfoote@icloud.com before running this setup script.';
  end if;

  insert into public.profiles (id, email, is_admin)
  values (admin_user_id, 'chfoote@icloud.com', true)
  on conflict (id) do update
  set email = excluded.email,
      is_admin = true;
end;
$$;
