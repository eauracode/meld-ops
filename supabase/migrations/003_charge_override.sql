-- Manual amount charged per order (discounts, special prices). Run once in Supabase:
-- SQL Editor > New query > paste > Run.
-- amount_charged becomes: the manual charge if set, otherwise rider fee + markup as before.

alter table public.orders add column if not exists charge_override integer check (charge_override >= 0);

alter table public.orders drop column amount_charged;
alter table public.orders add column amount_charged integer
  generated always as (coalesce(charge_override, public.meld_charged(rider_fee))) stored;

-- Carry over charges already changed on remittances, so orders and remittances agree.
update public.orders o
set charge_override = l.amount_charged
from public.remittance_lines l
where l.order_id = o.id
  and l.amount_charged <> public.meld_charged(o.rider_fee);
