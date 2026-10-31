drop policy if exists "Authenticated users can read trade block"
  on public.trade_block_listings;

create policy "Trade block is publicly readable"
  on public.trade_block_listings
  for select
  to anon, authenticated
  using (true);
