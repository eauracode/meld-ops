import { requireAdmin } from "@/lib/session";
import { lagosToday, periodRange } from "@/lib/calc";
import { fetchAll } from "@/lib/fetch-all";
import { RiderPay, type PayRow, type RiderTotal, type Payout } from "./rider-pay";
import type { Rider } from "@/lib/types";

export const metadata = { title: "Rider pay · Meld Ops" };

type Search = { from?: string; to?: string; rider?: string; show?: string };
const isDate = (s?: string) => Boolean(s && /^\d{4}-\d{2}-\d{2}$/.test(s));

type Row = {
  id: number;
  delivery_date: string;
  merchant_id: string;
  customer: string;
  area: string;
  address: string;
  rider_id: string;
  rider_fee: number;
  rider_payout_id: string | null;
};

export default async function RiderPayPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { supabase, merchants } = await requireAdmin();
  const sp = await searchParams;
  const week = periodRange("week", lagosToday());
  let from = isDate(sp.from) ? sp.from! : week.from;
  let to = isDate(sp.to) ? sp.to! : week.to;
  if (to < from) [from, to] = [to, from];
  const riderId = sp.rider ?? "";
  const show = sp.show === "paid" || sp.show === "all" ? sp.show : "unpaid";

  const { data: riderRows } = await supabase.from("riders").select("id,name,phone,active").order("name");
  const riders = (riderRows ?? []) as Rider[];

  let rows: Row[];
  let payoutRows: { id: string; rider_id: string; amount: number; orders: number; period_from: string; period_to: string; paid_at: string }[];
  try {
    [rows, { data: payoutRows }] = await Promise.all([
      fetchAll<Row>((a, b) =>
        supabase
          .from("orders")
          .select("id,delivery_date,merchant_id,customer,area,address,rider_id,rider_fee,rider_payout_id")
          .eq("status", "Delivered")
          .not("rider_id", "is", null)
          .gte("delivery_date", from)
          .lte("delivery_date", to)
          .order("delivery_date")
          .order("id")
          .range(a, b),
      ),
      supabase
        .from("rider_payouts")
        .select("id,rider_id,amount,orders,period_from,period_to,paid_at")
        .order("paid_at", { ascending: false })
        .limit(30)
        .then((r) => {
          if (r.error) throw new Error(r.error.message);
          return { data: r.data ?? [] };
        }),
    ]);
  } catch (e) {
    if (!/rider_payout/.test((e as Error).message)) throw e;
    return (
      <>
        <div className="pagehead">
          <h1>Rider pay</h1>
        </div>
        <section className="panel">
          <div className="empty">
            <h3>One database step first</h3>
            <p>Run supabase/migrations/004_rider_payouts.sql in Supabase (SQL Editor), then reload this page.</p>
          </div>
        </section>
      </>
    );
  }

  const riderName = (id: string) => riders.find((r) => r.id === id)?.name ?? "Removed rider";
  const merchantName = (id: string) => merchants.find((m) => m.id === id)?.name ?? "";

  const totals: Record<string, RiderTotal> = {};
  for (const o of rows) {
    const t = (totals[o.rider_id] ??= { riderId: o.rider_id, name: riderName(o.rider_id), deliveries: 0, total: 0, paid: 0, unpaid: 0 });
    t.deliveries++;
    t.total += o.rider_fee;
    if (o.rider_payout_id) t.paid += o.rider_fee;
    else t.unpaid += o.rider_fee;
  }
  const paidOn = new Map(payoutRows.map((p) => [p.id, p.paid_at]));

  const list: PayRow[] = rows
    .filter((o) => !riderId || o.rider_id === riderId)
    .filter((o) => show === "all" || (show === "paid") === Boolean(o.rider_payout_id))
    .map((o) => ({
      id: o.id,
      date: o.delivery_date,
      merchant: merchantName(o.merchant_id),
      customer: o.customer,
      area: o.area || o.address,
      rider: riderName(o.rider_id),
      fee: o.rider_fee,
      paid: Boolean(o.rider_payout_id),
      paidAt: o.rider_payout_id ? (paidOn.get(o.rider_payout_id) ?? null) : null,
    }));

  const payouts: Payout[] = payoutRows
    .filter((p) => !riderId || p.rider_id === riderId)
    .map((p) => ({ id: p.id, rider: riderName(p.rider_id), amount: p.amount, orders: p.orders, from: p.period_from, to: p.period_to, paidAt: p.paid_at }));

  return (
    <RiderPay
      from={from}
      to={to}
      rider={riderId}
      show={show}
      riders={riders}
      totals={Object.values(totals).sort((a, b) => b.unpaid - a.unpaid || a.name.localeCompare(b.name))}
      rows={list}
      payouts={payouts}
    />
  );
}
