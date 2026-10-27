-- Optional starter data: one merchant with a Lagos rate card and two riders.
-- Run after schema.sql. Edit names, products and fees in the app afterwards.

with m as (
  insert into public.merchants (name, phone, email, pickup_address)
  values ('Sample merchant', '', '', '14 Allen Avenue, Ikeja')
  returning id
),
p as (
  insert into public.products (merchant_id, name, price, stock)
  select id, x.name, x.price, x.stock from m,
    (values ('Sample product A', 8500, 50), ('Sample product B', 3500, 100)) as x (name, price, stock)
)
insert into public.rates (merchant_id, area, rider_fee)
select id, r.area, r.fee from m,
  (values
    ('Ikeja', 2500), ('Maryland', 2500), ('Oshodi', 2500), ('Gbagada', 2800), ('Yaba', 3000),
    ('Surulere', 3000), ('Ojota', 3000), ('Victoria Island', 4000), ('Ikoyi', 4000), ('Festac', 4000),
    ('Lekki Phase 1', 4500), ('Ikorodu', 5000), ('Ajah', 5500), ('Sangotedo', 6000)
  ) as r (area, fee);

insert into public.riders (name, phone) values ('Sample rider 1', ''), ('Sample rider 2', '');
