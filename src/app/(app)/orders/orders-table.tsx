"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { STATUSES, dmy, naira } from "@/lib/calc";
import { orderCode, type Order, type Rider } from "@/lib/types";
import { useFeedback } from "@/components/feedback";
import { updateOrder } from "@/app/actions/orders";

export function OrdersTable({ orders, riders }: { orders: Order[]; riders: Rider[] }) {
  const router = useRouter();
  const { toast } = useFeedback();
  // Local copy so a change shows at once; the server refresh then confirms it.
  const [rows, setRows] = useState(orders);
  const [prev, setPrev] = useState(orders);
  if (orders !== prev) {
    setPrev(orders);
    setRows(orders);
  }
  const active = riders.filter((r) => r.active);

  const change = async (o: Order, patch: { status?: string; rider_id?: string | null }) => {
    const before = { status: o.status, rider_id: o.rider_id };
    setRows((rs) => rs.map((r) => (r.id === o.id ? ({ ...r, ...patch } as Order) : r)));
    const res = await updateOrder(o.id, patch);
    if (!res.ok) {
      setRows((rs) => rs.map((r) => (r.id === o.id ? ({ ...r, ...before } as Order) : r)));
      toast(`Couldn’t update ${orderCode(o.id)}: ${res.error}`);
      return;
    }
    router.refresh();
    if (patch.status) {
      toast(
        <>
          {orderCode(o.id)} is now <b>{patch.status}</b>
        </>,
        async () => {
          await updateOrder(o.id, { status: before.status });
          router.refresh();
        },
      );
    }
  };

  return (
    <div className="tablewrap">
      <table className="cards">
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
            return (
              <tr key={o.id}>
                <td className="first" data-l="Order">
                  <span>
                    {o.customer}
                    <div className="small muted" style={{ fontWeight: 400 }}>
                      {code} · {dmy(o.delivery_date)}
                    </div>
                  </span>
                </td>
                <td data-l="Phone">{o.phone}</td>
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
                <td data-l="Status">
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
