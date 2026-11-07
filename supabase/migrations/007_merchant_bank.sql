-- Merchant bank details, for paying remittances. Run once in Supabase:
-- SQL Editor > New query > paste > Run. Safe to run again.

alter table public.merchants add column if not exists bank_name text not null default '';
alter table public.merchants add column if not exists account_number text not null default '';
alter table public.merchants add column if not exists account_name text not null default '';
