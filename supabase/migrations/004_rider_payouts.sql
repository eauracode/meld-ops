-- Rider pay: record when riders are paid for their delivered orders. Run once in Supabase:
-- SQL Editor > New query > paste > Run.

create table if not exists public.rider_payouts (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.riders (id) on delete restrict,
  amount integer not null check (amount >= 0),
  orders integer not null default 0,
  period_from date not null,
  period_to date not null,
  paid_at timestamptz not null default now(),
  paid_by uuid references public.profiles (id) on delete set null default auth.uid()
);
create index if not exists rider_payouts_rider on public.rider_payouts (rider_id, paid_at desc);

-- The payout that settled this order's rider pay; null = not paid yet.
alter table public.orders add column if not exists rider_payout_id uuid
  references public.rider_payouts (id) on delete set null;

alter table public.rider_payouts enable row level security;
drop policy if exists "admin rider payouts" on public.rider_payouts;
create policy "admin rider payouts" on public.rider_payouts for all using (public.is_admin()) with check (public.is_admin());
