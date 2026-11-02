-- In-house (salaried) vs partner (paid per delivery) riders. Run once in Supabase:
-- SQL Editor > New query > paste > Run. Safe to run again.
--
-- Each order keeps whether its rider was in-house when assigned (orders.inhouse), so changing a
-- rider's type later never rewrites past orders. rider_cost is the rider pay owed for the delivery:
-- the rider fee for partners, 0 for in-house (their salary, fuel and bike costs are booked outside the app).

alter table public.riders add column if not exists kind text not null default 'partner'
  check (kind in ('partner', 'inhouse'));

alter table public.orders add column if not exists inhouse boolean not null default false;
alter table public.orders add column if not exists rider_cost integer
  generated always as (case when inhouse then 0 else rider_fee end) stored;

create or replace function public.orders_rider_kind() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.rider_id is distinct from old.rider_id then
    new.inhouse := coalesce((select kind = 'inhouse' from riders where id = new.rider_id), false);
  else
    new.inhouse := old.inhouse; -- only a rider change sets it
  end if;
  return new;
end $$;

-- Riders can be added and edited by any staff, but only admins decide who is in-house.
create or replace function public.riders_kind_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'INSERT' and new.kind <> 'partner' or tg_op = 'UPDATE' and new.kind <> old.kind)
     and auth.uid() is not null and not is_admin() then
    raise exception 'Only admins can change whether a rider is in-house.';
  end if;
  return new;
end $$;

drop trigger if exists riders_kind_guard on public.riders;
create trigger riders_kind_guard before insert or update on public.riders
for each row execute function public.riders_kind_guard();

drop trigger if exists orders_rider_kind on public.orders;
create trigger orders_rider_kind before insert or update on public.orders
for each row execute function public.orders_rider_kind();
