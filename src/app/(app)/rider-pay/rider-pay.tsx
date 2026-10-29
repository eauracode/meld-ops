"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useFeedback } from "@/components/feedback";
import { dmy, naira, toNum } from "@/lib/calc";
import { payRider, setRiderFee, undoPayout } from "@/app/actions/rider-pay";
import type { Rider } from "@/lib/types";

export type RiderTotal = { riderId: string; name: string; deliveries: number; total: number; paid: number; unpaid: number };
export type PayRow = {
  id: number;
  date: string;
  merchant: string;
  customer: string;
  area: string;
  rider: string;
  fee: number;
  paid: boolean;
  paidAt: string | null;
};
export type Payout = { id: string; rider: string; amount: number; orders: number; from: string; to: string; paidAt: string };

type F = { from: string; to: string; rider: string; show: string };

const paidDate = (iso: string) => dmy(iso.slice(0, 10));

export function RiderPay({
  riders,
  totals,
  rows,
  payouts,
  ...f
}: F & { riders: Rider[]; totals: RiderTotal[]; rows: PayRow[]; payouts: Payout[] }) {
  const router = useRouter();
  const path = usePathname();
  const { toast, confirm } = useFeedback();

  const href = (next: Partial<F>) => {
    const m = { ...f, ...next };
    if (m.to < m.from) {
      if (next.from) m.to = m.from;
      else m.from = m.to;
    }
    const p = new URLSearchParams({ from: m.from, to: m.to, show: m.show });
    if (m.rider) p.set("rider", m.rider);
    return `${path}?${p}`;
  };
  const go = (next: Partial<F>) => router.replace(href(next), { scroll: false });

  const shown = f.rider ? totals.filter((t) => t.riderId === f.rider) : totals;
  const sum = (k: "deliveries" | "total" | "paid" | "unpaid") => shown.reduce((n, t) => n + t[k], 0);
  const range = f.from === f.to ? dmy(f.from) : `${dmy(f.from)} to ${dmy(f.to)}`;

  const pay = async (t: RiderTotal) => {
    const ok = await confirm({
      title: `Mark ${t.name} as paid?`,
      body: (
        <p>
          {naira(t.unpaid)} for their unpaid deliveries, {range}. Their pay on these orders is then locked.
        </p>
      ),
      ok: `Mark ${naira(t.unpaid)} paid`,
    });
    if (!ok) return;
    const r = await payRider(t.riderId, f.from, f.to);
    toast(r.ok ? `${t.name}: ${naira(r.amount)} for ${r.orders} deliver${r.orders === 1 ? "y" : "ies"} marked paid` : r.error);
    router.refresh();
  };

  const undo = async (p: Payout) => {
    const ok = await confirm({
      title: "Undo this payment?",
      body: (
        <p>
          {p.rider}’s {naira(p.amount)} payment goes back to unpaid, and their pay on those {p.orders} orders can be edited again.
        </p>
      ),
      ok: "Undo payment",
      danger: true,
    });
    if (!ok) return;
    const r = await undoPayout(p.id);
    toast(r.ok ? "Payment undone" : r.error);
    router.refresh();
  };

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Rider pay</h1>
          <p>What each rider is owed for delivered orders, {range}. Edit pay on unpaid orders; mark a rider paid to lock it.</p>
        </div>
      </div>

      <div className="filters" style={{ marginBottom: 16 }}>
        <div className="field">
          <label htmlFor="rp-from">From</label>
          <input className="input" type="date" id="rp-from" value={f.from} onChange={(e) => e.target.value && go({ from: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="rp-to">To</label>
          <input className="input" type="date" id="rp-to" value={f.to} onChange={(e) => e.target.value && go({ to: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="rp-r">Rider</label>
          <select className="input" id="rp-r" value={f.rider} onChange={(e) => go({ rider: e.target.value })}>
            <option value="">All riders</option>
            {riders.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <span className="lbl">Orders</span>
          <div className="seg" role="group" aria-label="Which orders">
            {(["unpaid", "paid", "all"] as const).map((s) => (
              <Link key={s} href={href({ show: s })} replace scroll={false} aria-current={f.show === s}>
                {s === "unpaid" ? "Unpaid" : s === "paid" ? "Paid" : "All"}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="totals">
        <div>
          <span>Deliveries</span>
          <b>{sum("deliveries")}</b>
        </div>
        <div>
          <span>Rider pay</span>
          <b>{naira(sum("total"))}</b>
        </div>
        <div>
          <span>Paid</span>
          <b>{naira(sum("paid"))}</b>
        </div>
        <div className="rev">
          <span>Still owed</span>
          <b>{naira(sum("unpaid"))}</b>
        </div>
        <div>
          <span>Riders</span>
          <b>{shown.length}</b>
        </div>
      </div>

      <section className="panel" style={{ marginBottom: 20 }}>
        <div className="panel-h">
          <h2>By rider</h2>
        </div>
        {shown.length ? (
          <div className="tablewrap">
            <table className="cards">
              <thead>
                <tr>
                  <th>Rider</th>
                  <th className="num">Deliveries</th>
                  <th className="num">Pay</th>
                  <th className="num">Paid</th>
                  <th className="num">Owed</th>
                  <th>
                    <span className="sr-only">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((t) => (
                  <tr key={t.riderId}>
                    <td className="first" data-l="Rider">
                      <Link href={href({ rider: t.riderId })} replace scroll={false}>
                        {t.name}
                      </Link>
                    </td>
                    <td data-l="Deliveries" className="num">
                      {t.deliveries}
                    </td>
                    <td data-l="Pay" className="num">
                      {naira(t.total)}
                    </td>
                    <td data-l="Paid" className="num">
                      {naira(t.paid)}
                    </td>
                    <td data-l="Owed" className="num">
                      <b>{naira(t.unpaid)}</b>
                    </td>
                    <td data-l="" className="num">
                      {t.unpaid > 0 ? (
                        <button className="btn sm primary" type="button" onClick={() => pay(t)}>
                          Mark paid
                        </button>
                      ) : (
                        <span className="pill st-Delivered">Paid</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            <h3>No deliveries</h3>
            <p>No delivered orders with a rider, {range}.</p>
          </div>
        )}
      </section>

      <section className="panel" style={{ marginBottom: 20 }}>
        <div className="panel-h">
          <h2>Orders</h2>
          <span className="muted small">{rows.length}</span>
        </div>
        {rows.length ? (
          <div className="tablewrap">
            <table className="cards">
              <thead>
                <tr>
                  <th>Date</th>
                  {!f.rider && <th>Rider</th>}
                  <th>Merchant</th>
                  <th>Customer</th>
                  <th>Area</th>
                  <th className="num">Rider pay (₦)</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.id}>
                    <td data-l="Date">{dmy(o.date)}</td>
                    {!f.rider && <td data-l="Rider">{o.rider}</td>}
                    <td data-l="Merchant">{o.merchant}</td>
                    <td className="first" data-l="Customer">
                      {o.customer}
                    </td>
                    <td data-l="Area" className="small">
                      {o.area}
                    </td>
                    <td data-l="Rider pay" className="num">
                      {o.paid ? naira(o.fee) : <FeeInput key={`${o.id}-${o.fee}`} id={o.id} fee={o.fee} customer={o.customer} />}
                    </td>
                    <td data-l="Status">
                      {o.paid ? (
                        <span className="pill st-Delivered">{o.paidAt ? `Paid ${paidDate(o.paidAt)}` : "Paid"}</span>
                      ) : (
                        <span className="pill st-Pending">Unpaid</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            <h3>No {f.show === "all" ? "" : `${f.show} `}orders</h3>
            <p>Nothing to show for these dates{f.rider ? " and rider" : ""}.</p>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-h">
          <h2>Payments</h2>
        </div>
        {payouts.length ? (
          <div className="tablewrap">
            <table className="cards">
              <thead>
                <tr>
                  <th>Paid on</th>
                  <th>Rider</th>
                  <th>For deliveries</th>
                  <th className="num">Orders</th>
                  <th className="num">Amount</th>
                  <th>
                    <span className="sr-only">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {payouts.map((p) => (
                  <tr key={p.id}>
                    <td data-l="Paid on">{paidDate(p.paidAt)}</td>
                    <td className="first" data-l="Rider">
                      {p.rider}
                    </td>
                    <td data-l="For deliveries" className="small">
                      {p.from === p.to ? dmy(p.from) : `${dmy(p.from)} to ${dmy(p.to)}`}
                    </td>
                    <td data-l="Orders" className="num">
                      {p.orders}
                    </td>
                    <td data-l="Amount" className="num">
                      <b>{naira(p.amount)}</b>
                    </td>
                    <td data-l="" className="num">
                      <button className="btn sm" type="button" onClick={() => undo(p)}>
                        Undo
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            <p>No rider payments recorded yet.</p>
          </div>
        )}
      </section>
    </>
  );
}

function FeeInput({ id, fee, customer }: { id: number; fee: number; customer: string }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [value, setValue] = useState(String(fee));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const n = Math.round(toNum(value));
    if (n === fee) return;
    setBusy(true);
    const r = await setRiderFee(id, value);
    setBusy(false);
    if (!r.ok) {
      setValue(String(fee));
      return toast(r.error);
    }
    toast(`Rider pay for ${customer} set to ${naira(n)}`);
    router.refresh();
  };

  return (
    <input
      className="input num"
      style={{ width: 110, textAlign: "right" }}
      inputMode="numeric"
      aria-label={`Rider pay for ${customer}`}
      value={value}
      disabled={busy}
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
    />
  );
}
