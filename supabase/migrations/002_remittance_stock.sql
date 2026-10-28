-- Stock remaining on remittances. Run once in Supabase: SQL Editor > New query > paste > Run.
-- Holds the merchant's stock when a remittance is marked sent or paid, e.g.
-- [{"product": "Shea body butter 250g", "stock": 42}], so old reports keep the numbers of their day.
alter table public.remittances add column if not exists stock_snapshot jsonb;
