-- Meld Ops database. Run once in Supabase: Dashboard > SQL Editor > New query > paste > Run.
-- Safe to re-run on an empty project only (it creates tables; it does not migrate).

-- ---------- people ----------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  email text not null default '',
  title text not null default 'Dispatcher',
  role text not null default 'ops' check (role in ('ops', 'admin')),
  all_merchants boolean not null default false,
  created_at timestamptz not null default now()
);

-- New sign-ups (invites) get a profile from the invite's metadata.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, email, title, role, all_merchants)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', ''),
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'title', 'Dispatcher'),
    coalesce(new.raw_user_meta_data ->> 'role', 'ops'),
    coalesce((new.raw_user_meta_data ->> 'all_merchants')::boolean, false)
  );
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------- merchants ----------
create table public.merchants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null default '',
  email text not null default '',
  pickup_address text not null default '',
  created_at timestamptz not null default now()
);

create table public.merchant_access (
  user_id uuid not null references public.profiles (id) on delete cascade,
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  primary key (user_id, merchant_id)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  name text not null,
  price integer not null default 0 check (price >= 0),
  stock integer not null default 0,
  unique (merchant_id, name)
);

create table public.rates (
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  area text not null,
  rider_fee integer not null check (rider_fee > 0),
  primary key (merchant_id, area)
);

create table public.riders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- orders ----------
-- Markup rule (keep in step with markup() in src/lib/calc.ts):
-- rider fee under 3,000 adds 2,000; under 5,000 adds 1,500; otherwise 1,000.
create function public.meld_charged(fee integer) returns integer
language sql immutable as $$
  select case
    when coalesce(fee, 0) <= 0 then 0
    when fee < 3000 then fee + 2000
    when fee < 5000 then fee + 1500
    else fee + 1000
  end
$$;

create table public.orders (
  id bigint generated always as identity (start with 1001) primary key,
  merchant_id uuid not null references public.merchants (id) on delete restrict,
  delivery_date date not null,
  customer text not null,
  phone text not null default '',
  address text not null default '',
  area text not null default '',
  product text not null default '',
  qty integer not null default 1 check (qty >= 0),
  order_value integer not null default 0 check (order_value >= 0),
  rider_fee integer not null default 0 check (rider_fee >= 0),
  -- Manual charge (discount or special price); null means rider fee + markup.
  charge_override integer check (charge_override >= 0),
  amount_charged integer generated always as (coalesce(charge_override, public.meld_charged(rider_fee))) stored,
  payment text not null default 'Cash on delivery' check (payment in ('Cash on delivery', 'Already paid')),
  notes text not null default '',
  rider_id uuid references public.riders (id) on delete set null,
  agent text not null default '',
  pickup_station text not null default '',
  contact_customer boolean not null default true,
  status text not null default 'Pending'
    check (status in ('Pending', 'Out for delivery', 'Delivered', 'Failed', 'Returned', 'Rescheduled')),
  raw_message text not null default '',
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index orders_merchant_date on public.orders (merchant_id, delivery_date);
create index orders_status_date on public.orders (status, delivery_date);

-- Delivered orders take their quantity out of the product's stock; moving off Delivered puts it back.
create function public.orders_stock() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.status = 'Delivered' then
    update products set stock = stock + old.qty where merchant_id = old.merchant_id and name = old.product;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.status = 'Delivered' then
    update products set stock = stock - new.qty where merchant_id = new.merchant_id and name = new.product;
  end if;
  return coalesce(new, old);
end $$;

create trigger orders_stock after insert or update of status, qty, product or delete on public.orders
for each row execute function public.orders_stock();

-- ---------- remittances ----------
create table public.remittances (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  remit_date date not null,
  status text not null default 'draft' check (status in ('draft', 'sent', 'paid')),
  other_deductions integer not null default 0 check (other_deductions >= 0),
  other_note text not null default '',
  generated_at timestamptz not null default now(),
  sent_at timestamptz,
  paid_at timestamptz,
  paid_by uuid references public.profiles (id) on delete set null,
  -- Merchant's stock when marked sent/paid: [{"product": "...", "stock": 42}]
  stock_snapshot jsonb,
  unique (merchant_id, remit_date)
);

create table public.remittance_lines (
  id uuid primary key default gen_random_uuid(),
  remittance_id uuid not null references public.remittances (id) on delete cascade,
  order_id bigint references public.orders (id) on delete set null,
  position integer not null default 0,
  customer text not null default '',
  product text not null default '',
  qty integer not null default 0,
  order_value integer not null default 0,
  amount_charged integer not null default 0,
  type text not null default 'Delivered' check (type in ('Delivered', 'Waybill', 'Failed'))
);
create index remittance_lines_remit on public.remittance_lines (remittance_id, position);

-- ---------- rider pay ----------
create table public.rider_payouts (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.riders (id) on delete restrict,
  amount integer not null check (amount >= 0),
  orders integer not null default 0,
  period_from date not null,
  period_to date not null,
  paid_at timestamptz not null default now(),
  paid_by uuid references public.profiles (id) on delete set null default auth.uid()
);
create index rider_payouts_rider on public.rider_payouts (rider_id, paid_at desc);

-- The payout that settled this order's rider pay; null = not paid yet.
alter table public.orders add column rider_payout_id uuid references public.rider_payouts (id) on delete set null;

-- ---------- access rules ----------
create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin')
$$;

create function public.can_access_merchant(mid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and (p.role = 'admin' or p.all_merchants
           or exists (select 1 from merchant_access a where a.user_id = p.id and a.merchant_id = mid))
  )
$$;

alter table public.profiles enable row level security;
alter table public.merchants enable row level security;
alter table public.merchant_access enable row level security;
alter table public.products enable row level security;
alter table public.rates enable row level security;
alter table public.riders enable row level security;
alter table public.orders enable row level security;
alter table public.remittances enable row level security;
alter table public.remittance_lines enable row level security;
alter table public.rider_payouts enable row level security;

create policy "own or admin reads profiles" on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy "admin updates profiles" on public.profiles for update using (public.is_admin());

create policy "read allowed merchants" on public.merchants for select using (public.can_access_merchant(id));
create policy "admin writes merchants" on public.merchants for all using (public.is_admin()) with check (public.is_admin());

create policy "own or admin reads access" on public.merchant_access for select using (user_id = auth.uid() or public.is_admin());
create policy "admin writes access" on public.merchant_access for all using (public.is_admin()) with check (public.is_admin());

create policy "read products" on public.products for select using (public.can_access_merchant(merchant_id));
create policy "admin writes products" on public.products for all using (public.is_admin()) with check (public.is_admin());

create policy "read rates" on public.rates for select using (public.can_access_merchant(merchant_id));
create policy "admin writes rates" on public.rates for all using (public.is_admin()) with check (public.is_admin());

create policy "staff read riders" on public.riders for select using (auth.uid() is not null);
create policy "staff add riders" on public.riders for insert with check (auth.uid() is not null);
create policy "staff update riders" on public.riders for update using (auth.uid() is not null);

create policy "read orders" on public.orders for select using (public.can_access_merchant(merchant_id));
create policy "add orders" on public.orders for insert with check (public.can_access_merchant(merchant_id));
create policy "update orders" on public.orders for update using (public.can_access_merchant(merchant_id))
  with check (public.can_access_merchant(merchant_id));
create policy "delete orders" on public.orders for delete using (public.can_access_merchant(merchant_id));

create policy "admin remittances" on public.remittances for all using (public.is_admin()) with check (public.is_admin());
create policy "admin remittance lines" on public.remittance_lines for all using (public.is_admin()) with check (public.is_admin());
create policy "admin rider payouts" on public.rider_payouts for all using (public.is_admin()) with check (public.is_admin());
