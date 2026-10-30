"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useFeedback } from "@/components/feedback";
import { dmy, toNum } from "@/lib/calc";
import { orderCode, type Product, type Station, type StationStock, type StockMove } from "@/lib/types";
import { addStock, countStock, moveStock } from "@/app/actions/stock";

type Mode = "add" | "move" | "count";
const TITLES: Record<Mode, string> = { add: "Add stock", move: "Move stock", count: "Count stock" };

/** Stock per station for one merchant, with add / move / count. */
export function StockPanel({ products, stations, stock, defaultStationId }: { products: Product[]; stations: Station[]; stock: StationStock[]; defaultStationId: string | null }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const dlg = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState({ mode: "add" as Mode, product: "", from: "", to: "", qty: "", note: "" });
  const [busy, setBusy] = useState(false);

  const qty = (productId: string, stationId: string) => stock.find((s) => s.product_id === productId && s.station_id === stationId)?.qty ?? 0;
  // Active stations, plus any inactive one still holding this merchant's stock.
  const cols = stations.filter((st) => st.active || stock.some((s) => s.station_id === st.id && s.qty !== 0));
  const active = stations.filter((st) => st.active);
  const home = active.find((st) => st.id === defaultStationId)?.id ?? active[0]?.id ?? "";
  const stationName = (id: string) => stations.find((st) => st.id === id)?.name ?? "";

  const open = (mode: Mode, product: Product) => {
    const from = mode === "move" ? (cols.find((st) => qty(product.id, st.id) > 0)?.id ?? home) : "";
    const to = mode === "move" ? (active.find((st) => st.id !== from)?.id ?? "") : home;
    setForm({ mode, product: product.id, from, to, qty: "", note: "" });
    dlg.current?.showModal();
  };

  const submit = async () => {
    const p = products.find((x) => x.id === form.product);
    if (!p) return;
    setBusy(true);
    const r =
      form.mode === "add"
        ? await addStock(p.id, form.to, form.qty, form.note)
        : form.mode === "move"
          ? await moveStock(p.id, form.from, form.to, form.qty, form.note)
          : await countStock(p.id, form.to, form.qty, form.note);
    setBusy(false);
    if (!r.ok) return toast(r.error);
    dlg.current?.close();
    const n = Math.round(toNum(form.qty));
    toast(
      form.mode === "add"
        ? `${n} ${p.name} added at ${stationName(form.to)}`
        : form.mode === "move"
          ? `${n} ${p.name} moved to ${stationName(form.to)}`
          : `${p.name} at ${stationName(form.to)} set to ${n}`,
    );
    router.refresh();
  };

  const product = products.find((x) => x.id === form.product);
  const have = product && form.mode === "move" ? qty(product.id, form.from) : null;

  return (
    <section className="panel" style={{ marginTop: 20 }}>
      <div className="panel-h">
        <h2>Stock by station</h2>
        <span className="spacer" />
        <span className="small muted">Delivered orders take stock from the order’s station</span>
      </div>
      {products.length ? (
        <div className="tablewrap">
          <table className="cards">
            <thead>
              <tr>
                <th>Product</th>
                {cols.map((st) => (
                  <th key={st.id} className="num">
                    {st.name}
                  </th>
                ))}
                <th className="num">Total</th>
                <th>
                  <span className="sr">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td className="first" data-l="Product">
                    {p.name}
                  </td>
                  {cols.map((st) => (
                    <td key={st.id} data-l={st.name} className="num">
                      {qty(p.id, st.id)}
                    </td>
                  ))}
                  <td data-l="Total" className="num">
                    <b>{p.stock}</b>
                  </td>
                  <td data-l="">
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
                      <button className="btn sm" type="button" onClick={() => open("add", p)} disabled={!active.length}>
                        Add
                      </button>
                      <button className="btn sm" type="button" onClick={() => open("move", p)} disabled={active.length < 2}>
                        Move
                      </button>
                      <button className="btn sm" type="button" onClick={() => open("count", p)} disabled={!active.length}>
                        Count
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="panel-b muted">Add a product above to start tracking its stock.</div>
      )}
      {active.length < 2 && products.length > 0 && (
        <p className="panel-b small muted" style={{ borderTop: "1px solid var(--line)" }}>
          To move stock, add another station under Setup → Stations.
        </p>
      )}

      <dialog ref={dlg} aria-labelledby="stk-title">
        <div className="dlg-h">
          <h2 id="stk-title">
            {TITLES[form.mode]}
            {product ? `: ${product.name}` : ""}
          </h2>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="dlg-b" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {form.mode === "move" && (
              <div className="field">
                <label htmlFor="stk-from">From</label>
                <select className="input" id="stk-from" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })}>
                  {cols.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.name} ({product ? qty(product.id, st.id) : 0})
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="field">
              <label htmlFor="stk-to">{form.mode === "move" ? "To" : "Station"}</label>
              <select className="input" id="stk-to" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })}>
                {active
                  .filter((st) => form.mode !== "move" || st.id !== form.from)
                  .map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.name}
                      {form.mode === "count" && product ? ` (now ${qty(product.id, st.id)})` : ""}
                    </option>
                  ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="stk-qty">{form.mode === "add" ? "Units arrived" : form.mode === "move" ? "Units to move" : "Units counted"}</label>
              <input className="input" id="stk-qty" inputMode="numeric" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} autoFocus aria-describedby="stk-help" />
              <p className="small muted" id="stk-help">
                {form.mode === "add"
                  ? "Added on top of what’s already there."
                  : form.mode === "move"
                    ? `${have ?? 0} available at ${stationName(form.from)}.`
                    : "Replaces the number on record for this station; the difference is logged."}
              </p>
            </div>
            <div className="field">
              <label htmlFor="stk-note">Note (optional)</label>
              <input
                className="input"
                id="stk-note"
                placeholder={form.mode === "add" ? "e.g. Restock from merchant" : form.mode === "move" ? "e.g. For Ikeja deliveries" : "e.g. Monthly count"}
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
              />
            </div>
          </div>
          <div className="dlg-f">
            <button className="btn" type="button" onClick={() => dlg.current?.close()}>
              Cancel
            </button>
            <button className="btn primary" type="submit" disabled={busy}>
              {TITLES[form.mode]}
            </button>
          </div>
        </form>
      </dialog>
    </section>
  );
}

const KIND: Record<StockMove["kind"], string> = {
  added: "Added",
  moved: "Moved",
  delivered: "Delivered",
  undelivered: "Delivery undone",
  corrected: "Count",
};

/** The merchant's latest stock changes, newest first. */
export function StockHistory({ moves, stations, people }: { moves: StockMove[]; stations: Station[]; people: Record<string, string> }) {
  const [product, setProduct] = useState("");
  const names = [...new Set(moves.map((m) => m.product))].sort();
  const shown = product ? moves.filter((m) => m.product === product) : moves;
  const st = (id: string | null) => (id ? (stations.find((s) => s.id === id)?.name ?? "Removed station") : "");
  const when = (iso: string) => {
    const t = new Date(iso);
    const time = t.toLocaleTimeString("en-GB", { timeZone: "Africa/Lagos", hour: "2-digit", minute: "2-digit" });
    return `${dmy(t.toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" }))} ${time}`;
  };

  return (
    <section className="panel" style={{ marginTop: 20 }}>
      <div className="panel-h">
        <h2>Stock history</h2>
        <span className="spacer" />
        {names.length > 1 && (
          <>
            <label htmlFor="sh-p" className="sr">
              Product
            </label>
            <select className="input" id="sh-p" style={{ width: "auto" }} value={product} onChange={(e) => setProduct(e.target.value)}>
              <option value="">All products</option>
              {names.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </>
        )}
      </div>
      {shown.length ? (
        <div className="tablewrap" style={{ maxHeight: 420, overflow: "auto" }}>
          <table className="cards">
            <thead>
              <tr>
                <th>When</th>
                <th>Product</th>
                <th>What</th>
                <th className="num">Units</th>
                <th>Station</th>
                <th>Note</th>
                <th>By</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((m) => (
                <tr key={m.id}>
                  <td data-l="When" className="small">
                    {when(m.created_at)}
                  </td>
                  <td className="first" data-l="Product">
                    {m.product}
                  </td>
                  <td data-l="What">{KIND[m.kind]}</td>
                  <td data-l="Units" className="num">
                    {m.kind === "moved" ? m.qty : m.qty > 0 ? `+${m.qty}` : `−${Math.abs(m.qty)}`}
                  </td>
                  <td data-l="Station" className="small">
                    {m.kind === "moved" ? `${st(m.from_station)} → ${st(m.to_station)}` : st(m.to_station ?? m.from_station)}
                  </td>
                  <td data-l="Note" className="small">
                    {m.order_id ? orderCode(m.order_id) : m.note || "—"}
                  </td>
                  <td data-l="By" className="small">
                    {m.created_by ? (people[m.created_by] ?? "—") : m.order_id ? "Order status" : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="panel-b muted">No stock changes yet.</div>
      )}
    </section>
  );
}
