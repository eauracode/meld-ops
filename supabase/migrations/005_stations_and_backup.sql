-- Stations (stock held per station), stock history, and the backup log. Run once in Supabase:
-- SQL Editor > New query > paste > Run. Safe to run again.
--
-- products.stock stays the merchant's total across stations (kept up to date by a trigger), so the
-- remittance stock section and everything else reading it keeps working.

-- ---------- stations ----------
create table if not exists public.stations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  address text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.station_stock (
  product_id uuid not null references public.products (id) on delete cascade,
  station_id uuid not null references public.stations (id) on delete restrict,
  qty integer not null default 0,
  primary key (product_id, station_id)
);

-- Every stock change. qty is signed: + into to_station, − out of from_station; a move is +qty from → to.
create table if not exists public.stock_moves (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  product text not null default '',
  kind text not null check (kind in ('added', 'moved', 'delivered', 'undelivered', 'corrected')),
  qty integer not null,
  from_station uuid references public.stations (id) on delete set null,
  to_station uuid references public.stations (id) on delete set null,
  order_id bigint references public.orders (id) on delete set null,
  note text not null default '',
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists stock_moves_merchant on public.stock_moves (merchant_id, created_at desc);

alter table public.merchants add column if not exists default_station_id uuid references public.stations (id) on delete set null;
alter table public.orders add column if not exists station_id uuid references public.stations (id) on delete set null;

-- ---------- today's stock becomes "Main station" ----------
insert into public.stations (name) values ('Main station') on conflict (name) do nothing;

do $$
declare main uuid;
begin
  select id into main from public.stations where name = 'Main station';
  insert into public.station_stock (product_id, station_id, qty)
    select id, main, stock from public.products where stock <> 0
    on conflict do nothing;
  insert into public.stock_moves (merchant_id, product_id, product, kind, qty, to_station, note, created_by)
    select p.merchant_id, p.id, p.name, 'corrected', p.stock, main, 'Opening balance', null
    from public.products p
    where p.stock <> 0 and not exists (select 1 from public.stock_moves m where m.product_id = p.id);
  update public.merchants set default_station_id = main where default_station_id is null;
  -- Delivered orders already took their stock from here; un-delivering them puts it back here.
  update public.orders set station_id = main where station_id is null;
end $$;

-- ---------- products.stock = sum over stations ----------
create or replace function public.sync_product_stock() returns trigger
language plpgsql security definer set search_path = public as $$
declare pid uuid := coalesce(new.product_id, old.product_id);
begin
  update products set stock = coalesce((select sum(qty) from station_stock where product_id = pid), 0) where id = pid;
  return null;
end $$;

drop trigger if exists station_stock_sync on public.station_stock;
create trigger station_stock_sync after insert or update or delete on public.station_stock
for each row execute function public.sync_product_stock();

create or replace function public.stock_bump(p_product uuid, p_station uuid, p_delta integer) returns void
language sql set search_path = public as $$
  insert into station_stock (product_id, station_id, qty) values (p_product, p_station, p_delta)
  on conflict (product_id, station_id) do update set qty = station_stock.qty + excluded.qty;
$$;
revoke execute on function public.stock_bump(uuid, uuid, integer) from public, anon, authenticated;

-- ---------- delivered orders take stock from their station ----------
create or replace function public.orders_stock() returns trigger
language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  if tg_op = 'UPDATE' and old.status = new.status and old.qty = new.qty and old.product = new.product
     and old.station_id is not distinct from new.station_id then
    return new;
  end if;
  if tg_op in ('UPDATE', 'DELETE') and old.status = 'Delivered' and old.station_id is not null then
    select id into pid from products where merchant_id = old.merchant_id and name = old.product;
    if pid is not null then
      perform stock_bump(pid, old.station_id, old.qty);
      insert into stock_moves (merchant_id, product_id, product, kind, qty, to_station, order_id, note)
      values (old.merchant_id, pid, old.product, 'undelivered', old.qty, old.station_id,
              case when tg_op = 'DELETE' then null else old.id end,
              case when tg_op = 'DELETE' then 'Order MLD-' || old.id || ' deleted' else '' end);
    end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.status = 'Delivered' and new.station_id is not null then
    select id into pid from products where merchant_id = new.merchant_id and name = new.product;
    if pid is not null then
      perform stock_bump(pid, new.station_id, -new.qty);
      insert into stock_moves (merchant_id, product_id, product, kind, qty, from_station, order_id)
      values (new.merchant_id, pid, new.product, 'delivered', -new.qty, new.station_id, new.id);
    end if;
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists orders_stock on public.orders;
create trigger orders_stock after insert or update of status, qty, product, station_id or delete on public.orders
for each row execute function public.orders_stock();

-- ---------- admin stock actions (one transaction each, logged) ----------
create or replace function public.stock_add(p_product uuid, p_station uuid, p_qty integer, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
declare m uuid; n text;
begin
  if not is_admin() then raise exception 'Only admins can change stock.'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'Enter how many units to add.'; end if;
  select merchant_id, name into m, n from products where id = p_product;
  if m is null then raise exception 'Product not found.'; end if;
  perform stock_bump(p_product, p_station, p_qty);
  insert into stock_moves (merchant_id, product_id, product, kind, qty, to_station, note)
  values (m, p_product, n, 'added', p_qty, p_station, coalesce(p_note, ''));
end $$;

create or replace function public.stock_move(p_product uuid, p_from uuid, p_to uuid, p_qty integer, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
declare m uuid; n text; have integer; sname text;
begin
  if not is_admin() then raise exception 'Only admins can change stock.'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'Enter how many units to move.'; end if;
  if p_from = p_to then raise exception 'Pick two different stations.'; end if;
  select merchant_id, name into m, n from products where id = p_product;
  if m is null then raise exception 'Product not found.'; end if;
  select qty into have from station_stock where product_id = p_product and station_id = p_from for update;
  if coalesce(have, 0) < p_qty then
    select name into sname from stations where id = p_from;
    raise exception 'Only % of % at %.', greatest(coalesce(have, 0), 0), n, sname;
  end if;
  perform stock_bump(p_product, p_from, -p_qty);
  perform stock_bump(p_product, p_to, p_qty);
  insert into stock_moves (merchant_id, product_id, product, kind, qty, from_station, to_station, note)
  values (m, p_product, n, 'moved', p_qty, p_from, p_to, coalesce(p_note, ''));
end $$;

create or replace function public.stock_set(p_product uuid, p_station uuid, p_count integer, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
declare m uuid; n text; have integer; d integer;
begin
  if not is_admin() then raise exception 'Only admins can change stock.'; end if;
  if p_count is null or p_count < 0 then raise exception 'Enter the number counted.'; end if;
  select merchant_id, name into m, n from products where id = p_product;
  if m is null then raise exception 'Product not found.'; end if;
  select qty into have from station_stock where product_id = p_product and station_id = p_station for update;
  d := p_count - coalesce(have, 0);
  if d = 0 then return; end if;
  perform stock_bump(p_product, p_station, d);
  insert into stock_moves (merchant_id, product_id, product, kind, qty, to_station, note)
  values (m, p_product, n, 'corrected', d, p_station, coalesce(nullif(p_note, ''), 'Stock count'));
end $$;

-- ---------- backup log ----------
create table if not exists public.backup_runs (
  id uuid primary key default gen_random_uuid(),
  ran_at timestamptz not null default now(),
  ok boolean not null,
  rows integer not null default 0,
  error text not null default ''
);

-- ---------- access ----------
alter table public.stations enable row level security;
alter table public.station_stock enable row level security;
alter table public.stock_moves enable row level security;
alter table public.backup_runs enable row level security;

drop policy if exists "staff read stations" on public.stations;
create policy "staff read stations" on public.stations for select using (auth.uid() is not null);
drop policy if exists "admin writes stations" on public.stations;
create policy "admin writes stations" on public.stations for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "read station stock" on public.station_stock;
create policy "read station stock" on public.station_stock for select
  using (exists (select 1 from public.products p where p.id = product_id and public.can_access_merchant(p.merchant_id)));
drop policy if exists "admin writes station stock" on public.station_stock;
create policy "admin writes station stock" on public.station_stock for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "read stock moves" on public.stock_moves;
create policy "read stock moves" on public.stock_moves for select using (public.can_access_merchant(merchant_id));
drop policy if exists "admin writes stock moves" on public.stock_moves;
create policy "admin writes stock moves" on public.stock_moves for insert with check (public.is_admin());

drop policy if exists "admin reads backups" on public.backup_runs;
create policy "admin reads backups" on public.backup_runs for select using (public.is_admin());
