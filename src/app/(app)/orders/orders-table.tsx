"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { STATUSES, dmy, lagosToday, naira } from "@/lib/calc";
import { orderCode, type Order, type Rider } from "@/lib/types";
import { useFeedback } from "@/components/feedback";
import { updateOrder } from "@/app/actions/orders";

type Patch = { status?: string; rider_id?: string | null; delivery_date?: string };

/**
 * On phones each row is a card, collapsed to the customer and status; tapping the name shows the rest.
 * `attention` adds "Move to today" (overdue orders); `merchantNames` shows the merchant on each order.
 */
export function OrdersTable({
  orders,
  riders,
  merchantNames,
  attention,
}: {
  orders: Order[];
  riders: Rider[];
  merchantNames?: Record<string, string>;
  attention?: boolean;
}) {
  const router = useRouter();
  const { toast } = useFeedback();
  // Local copy so a change shows at once; the server refresh then confirms it.
  const [rows, setRows] = useState(orders);
  const [prev, setPrev] = useState(orders);
  if (orders !== prev) {
    setPrev(orders);
    setRows(orders);
  }
  const [open, setOpen] = useState<Set<number>>(() => new Set());
  const toggle = (id: number) =>
    setOpen((s) => {
      const n = new Set(s);
      if (!n.delete(id)) n.add(id);
      return n;
    });
  const active = riders.filter((r) => r.active);

  const change = async (o: Order, patch: Patch) => {
    const before = { status: o.status, rider_id: o.rider_id, delivery_date: o.delivery_date };
    setRows((rs) => rs.map((r) => (r.id === o.id ? ({ ...r, ...patch } as Order) : r)));
    const res = await updateOrder(o.id, patch);
    if (!res.ok) {
      setRows((rs) => rs.map((r) => (r.id === o.id ? ({ ...r, ...before } as Order) : r)));
      toast(`Couldn’t update ${orderCode(o.id)}: ${res.error}`);
      return;
    }
    router.refresh();
    if (patch.status || patch.delivery_date) {
      const undo = patch.status ? { status: before.status } : { delivery_date: before.delivery_date };
      toast(
        patch.status ? (
          <>
            {orderCode(o.id)} is now <b>{patch.status}</b>
          </>
        ) : (
          <>{orderCode(o.id)} moved to today</>
        ),
        async () => {
          await updateOrder(o.id, undo);
          router.refresh();
        },
      );
    }
  };

  return (
    <div className="tablewrap">
      <table className="cards collapsible">
        <thead>
          <tr>
            <th>Order</th>
            <th>Phone</th>
            <th>Area</th>
            <th>Product</th>
            <th className="num">Value</th>
            <th className="num">Charged</th>
            <th>Rider</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => {
            const code = orderCode(o.id);
            const gone = o.rider_id && !active.some((r) => r.id === o.rider_id) ? riders.find((r) => r.id === o.rider_id) : null;
            const isOpen = open.has(o.id);
            const more = `more-${attention ? "a" : "o"}-${o.id}`;
            return (
              <tr key={o.id} className={isOpen ? "open" : undefined}>
                <td className="first" data-l="Order">
                  <span>
                    <button className="rowtoggle" type="button" aria-expanded={isOpen} aria-controls={more} onClick={() => toggle(o.id)}>
                      <span>{o.customer}</span>
                      <svg className="chev" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    <div className="small muted" style={{ fontWeight: 400 }}>
                      {code} · {dmy(o.delivery_date)}
                      {merchantNames && ` · ${merchantNames[o.merchant_id] ?? ""}`}
                    </div>
                    {attention && (
                      <button className="btn sm" type="button" style={{ marginTop: 6 }} onClick={() => change(o, { delivery_date: lagosToday() })}>
                        Move to today
                      </button>
                    )}
                  </span>
                </td>
                <td data-l="Phone" id={more}>
                  {o.phone}
                </td>
                <td data-l="Area">{o.area || "—"}</td>
                <td data-l="Product">
                  {o.product} × {o.qty}
                </td>
                <td data-l="Value" className="num">
                  {naira(o.order_value)}
                </td>
                <td data-l="Charged" className="num">
                  {naira(o.amount_charged)}
                </td>
                <td data-l="Rider">
                  <select className="input" aria-label={`Rider for ${code}`} value={o.rider_id ?? ""} onChange={(e) => change(o, { rider_id: e.target.value || null })}>
                    <option value="">Unassigned</option>
                    {active.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                    {gone && <option value={gone.id}>{gone.name} (inactive)</option>}
                  </select>
                </td>
                <td data-l="Status" className="keep">
                  <select className="input" aria-label={`Status for ${code}`} value={o.status} onChange={(e) => change(o, { status: e.target.value })}>
                    {STATUSES.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
