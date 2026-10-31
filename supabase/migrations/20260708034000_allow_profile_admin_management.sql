drop policy if exists "Users can update their own profile"
  on public.profiles;

drop policy if exists "Authenticated users can update profiles"
  on public.profiles;

create policy "Authenticated users can update profiles"
  on public.profiles
  for update
  to authenticated
  using (true)
  with check (true);

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update
  set email = excluded.email;

  return new;
end;
$$;

drop trigger if exists create_profile_for_new_user on auth.users;

create trigger create_profile_for_new_user
  after insert on auth.users
  for each row
  execute function public.create_profile_for_new_user();
