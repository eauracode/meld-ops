# Meld Ops

Meld’s operations app. It turns WhatsApp order messages into orders (Groq `gpt-oss-120b`), builds the delivery report, and works out each merchant’s daily remittance.

Built with Next.js 16 on Vercel, Supabase (Postgres and sign-in, free plan) and plain CSS ported from the approved prototype.

## Business rules

All of these live in `src/lib/calc.ts` and are covered by tests (`npm test`).

| Rule | Where |
| --- | --- |
| Markup on the rider fee: under ₦3,000 adds ₦2,000; ₦3,000 to ₦4,999 adds ₦1,500; ₦5,000 and over adds ₦1,000 | `markup()`, mirrored in SQL as `meld_charged()` for `orders.amount_charged` |
| Revenue = amount charged − rider fee | `reportTotals()` |
| Expected remittance = money received − delivery fees − waybill charges − failed fees − other deductions | `remitSummary()` |
| Failed or returned lines are charged 50% of the amount charged | `FAILED_FEE_SHARE` |
| Line type: failed/returned status → Failed; “waybill” in the customer name → Waybill | `autoLineType()` |
| Delivered orders take their quantity out of the stock at the order’s station (none = no stock change); moving off Delivered puts it back | SQL trigger `orders_stock` (migration 005) |
| Stock is held per station; `products.stock` is the total, kept in step by a trigger. Add, move and count go through `stock_add`, `stock_move`, `stock_set`, and every change is logged in `stock_moves` | migration 005, `src/app/actions/stock.ts` |
| Remittances show the merchant’s stock remaining (live while a draft, saved when sent or paid); hidden for merchants with no stock held | `stockRemaining()`, `remittances.stock_snapshot` |

If you change the markup, change both `markup()` and `meld_charged()`.

An order’s amount charged can be changed by hand (for a discount or special price) by editing **Amount charged** on its remittance line. That sets `orders.charge_override`, which replaces the markup for that order everywhere (dashboard, delivery report). The report tags those charges “edited”.

**Rider pay** lists each rider’s delivered orders for a date range. Admins can change the rider pay on unpaid orders; the merchant’s charge stays the same (pinned as a manual charge), so only revenue moves. **Mark paid** records one payment (`rider_payouts`) covering every unpaid delivered order for that rider in the range and locks their pay; **Undo** reverses it.

## Nightly backup to Google Sheets

Every night (Vercel Cron, `vercel.json`, 23:00 UTC = midnight Lagos) `/api/backup` rewrites one Google Sheet with every table: Orders, Remittances, Remittance lines, Merchants, Stock, Stock log, Riders, Rider payments, Rate cards, Stations, plus an About tab with the time and row counts. Download it any time from Google Sheets (File → Download → Microsoft Excel). Admins see the last run and a **Back up now** button under **Team and access**; the Overview warns if no backup has succeeded since the day before yesterday. Runs are logged in `backup_runs`.

Setup, once:

1. In [Google Cloud console](https://console.cloud.google.com/), create a project, enable the **Google Sheets API**, then under **IAM & Admin → Service accounts** create a service account and add a **JSON key**.
2. Create an empty Google Sheet and **Share** it with the service account’s email as **Editor**.
3. Add to Vercel (and `.env.local`): `GOOGLE_SA_EMAIL` (`client_email` from the JSON), `GOOGLE_SA_KEY` (`private_key`), `BACKUP_SHEET_ID` (the long id in the sheet’s URL) and `CRON_SECRET` (any long random string). Redeploy.

It is a readable copy that could rebuild the records by hand, not a one-click restore.

## First-time setup

### 1. Supabase (free)

1. Create a project at [supabase.com](https://supabase.com). Choose a region close to Lagos (for example Europe West, London).
2. Open **SQL Editor**, paste all of `supabase/schema.sql` and run it. Optionally run `supabase/seed.sql` for a sample merchant and rate card.
3. Under **Authentication > Sign In / Providers**, turn off **Allow new users to sign up**. Staff join by invite only.
4. Under **Authentication > Email Templates**, change the link in **Invite user** and **Reset password** so it opens the app:
   - Invite: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite`
   - Reset password: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`
5. Under **Authentication > URL Configuration**, set **Site URL** to the app’s address (`http://localhost:3000` while testing; your Vercel URL later).
6. Create the first admin. Under **Authentication > Users > Add user**, add your email and a password with **Auto confirm** ticked. Then in the SQL Editor run:

   ```sql
   update public.profiles set role = 'admin', all_merchants = true, name = 'Your name', title = 'Admin'
   where email = 'you@example.com';
   ```

7. Copy the keys from **Project Settings > API Keys**.

Supabase’s free email service only sends a few emails an hour. For real invites, connect your own SMTP under **Authentication > Emails > SMTP settings**.

### Adding staff

Admins add people under **Team and access → Add person** with a temporary password. Tick **Email it to them** to send the password and sign-in link; they must choose their own password at first sign-in. **Set password** gives anyone a new temporary password.

Emailing needs SMTP settings (`SMTP_*` in `.env.example`). The simplest free option is a Gmail account with an [App Password](https://myaccount.google.com/apppasswords) (2-Step Verification must be on); Gmail allows about 500 emails a day. Without SMTP settings the checkbox is off and admins share passwords themselves. The same SMTP details can go into Supabase (**Authentication > Emails > SMTP settings**) so its reset emails stop hitting the free-tier limit.

### 2. Groq

Create a key at [console.groq.com/keys](https://console.groq.com/keys).

### 3. Run locally

```bash
cp .env.example .env.local   # then fill in the values
npm install
npm run dev                  # http://localhost:3000
npm test                     # business-rule tests
```

## Deploying to Vercel

1. Push this folder to a GitHub repository.
2. In Vercel: **Add New > Project**, then import the repository. The framework is detected as Next.js.
3. Add the environment variables from `.env.example`. Set `NEXT_PUBLIC_SITE_URL` to the Vercel URL, for example `https://meld-ops.vercel.app`.
4. Deploy, then set Supabase’s **Site URL** (step 5 above) to the same address.

## Where things are

```text
src/lib/calc.ts            business rules (markup, remittance, report totals, matching)
src/lib/extract.ts         Groq extraction prompt and parsing (server only)
src/lib/session.ts         signed-in user, role, merchants they can see, selected merchant
src/app/actions/*.ts       server actions (every one checks the session; admin-only ones check the role)
src/app/(app)/*            screens: new, orders, report, remittance, merchants, riders, team
src/proxy.ts               refreshes the session; sends signed-out visitors to /signin
supabase/schema.sql        tables, markup function, stock trigger, row-level security
```

Access is enforced in the database with row-level security: ops staff only read and write orders for the merchants they’re given, and only admins touch remittances, merchant settings and the team.
