"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { STATUSES, dmy, lagosToday, naira, toNum } from "@/lib/calc";
import { orderCode, riderLabel, type Order, type Rider } from "@/lib/types";
import { useFeedback } from "@/components/feedback";
import { updateOrder, updateQuantity } from "@/app/actions/orders";

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

  // Quantity dialog: the value follows the quantity at the same unit price until it's typed over.
  const dlg = useRef<HTMLDialogElement>(null);
  const [edit, setEdit] = useState<{ order: Order; qty: string; value: string; typed: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const openQty = (o: Order) => {
    setEdit({ order: o, qty: String(o.qty), value: String(o.order_value), typed: false });
    dlg.current?.showModal();
  };
  const setQty = (qty: string) =>
    setEdit((e) => {
      if (!e) return e;
      const unit = e.order.qty ? e.order.order_value / e.order.qty : 0;
      const n = Math.round(toNum(qty));
      return { ...e, qty, value: e.typed || !n ? e.value : String(Math.round(unit * n)) };
    });
  const saveQty = async () => {
    if (!edit) return;
    const o = edit.order;
    setSaving(true);
    const res = await updateQuantity(o.id, edit.qty, edit.value);
    setSaving(false);
    if (!res.ok) return toast(res.error ?? "Couldn’t save.");
    dlg.current?.close();
    const q = Math.round(toNum(edit.qty));
    setRows((rs) => rs.map((r) => (r.id === o.id ? { ...r, qty: q, order_value: Math.round(toNum(edit.value)) } : r)));
    router.refresh();
    toast(
      <>
        {orderCode(o.id)} is now <b>{o.product} × {q}</b>, {naira(toNum(edit.value))}
      </>,
      async () => {
        await updateQuantity(o.id, o.qty, o.order_value);
        router.refresh();
      },
    );
  };

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
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    {o.product} × {o.qty}
                    <button className="btn sm" type="button" onClick={() => openQty(o)} aria-label={`Change quantity for ${code}`}>
                      Edit
                    </button>
                  </span>
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
                        {riderLabel(r)}
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

      <dialog ref={dlg} aria-labelledby="qty-title">
        {edit && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void saveQty();
            }}
          >
            <div className="dlg-h">
              <h2 id="qty-title">Change quantity: {orderCode(edit.order.id)}</h2>
              <p className="small muted">
                {edit.order.customer} · {edit.order.product} × {edit.order.qty}, {naira(edit.order.order_value)}
              </p>
            </div>
            <div className="dlg-b" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div className="field">
                <label htmlFor="qty-n">Quantity the customer took</label>
                <input className="input" id="qty-n" inputMode="numeric" value={edit.qty} onChange={(e) => setQty(e.target.value)} autoFocus />
              </div>
              <div className="field">
                <label htmlFor="qty-v">Order value (₦)</label>
                <input
                  className="input"
                  id="qty-v"
                  inputMode="numeric"
                  value={edit.value}
                  onChange={(e) => setEdit({ ...edit, value: e.target.value, typed: true })}
                  aria-describedby="qty-help"
                />
                <p className="small muted" id="qty-help">
                  Worked out at the same price per unit; change it if the customer paid a different amount. The delivery charge stays the same.
                  {edit.order.status === "Delivered" ? " Stock and any draft remittance update to match." : ""}
                </p>
              </div>
            </div>
            <div className="dlg-f">
              <button className="btn" type="button" onClick={() => dlg.current?.close()}>
                Cancel
              </button>
              <button className="btn primary" type="submit" disabled={saving}>
                Save
              </button>
            </div>
          </form>
        )}
      </dialog>
    </div>
  );
}
