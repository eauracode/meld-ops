"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { useFeedback } from "@/components/feedback";
import { LINE_TYPES, dmy, naira, remitSummary, stockRemaining, toNum, type LineType, type RemitSummary, type StockRow } from "@/lib/calc";
import type { Merchant, Remittance, RemittanceLine } from "@/lib/types";
import { generateRemittance, saveRemittance, setRemittanceStatus } from "@/app/actions/remittance";
import { buildRemitPdf } from "./remit-pdf";

type Line = Omit<RemittanceLine, "qty" | "order_value" | "amount_charged" | "position"> & {
  qty: string;
  order_value: string;
  amount_charged: string;
};
type Hist = { id: string; date: string; status: "sent" | "paid"; expected: number };

const toLine = (l: RemittanceLine): Line => ({
  ...l,
  qty: String(l.qty),
  order_value: String(l.order_value),
  amount_charged: String(l.amount_charged),
});
const newId = () => `new-${Math.random().toString(36).slice(2, 9)}`;

export function remitText(merchantName: string, date: string, s: RemitSummary, note: string, stock: StockRow[]) {
  return [
    `Meld remittance – ${merchantName} – ${dmy(date)}`,
    "",
    `Money received: ${naira(s.received)}`,
    `Units delivered: ${s.units}`,
    `Delivery fees: −${naira(s.deliveryFees)}`,
    `Waybill charges: −${naira(s.waybillFees)}`,
    `Failed fees: −${naira(s.failedFees)}`,
    `Other deductions: −${naira(s.other)}${note ? ` (${note})` : ""}`,
    "",
    `Expected remittance: ${naira(s.expected)}`,
    ...(stock.length ? ["", "Stock remaining with Meld:", ...stock.map((r) => `• ${r.product}: ${r.stock}`)] : []),
    "",
    "MELD Logistics Company Ltd",
  ].join("\n");
}

export function RemitEditor({
  merchant,
  remit,
  initialLines,
  products,
  history,
}: {
  merchant: Merchant;
  remit: Remittance;
  initialLines: RemittanceLine[];
  /** Current stock per product; used live while the remittance is a draft. */
  products: { name: string; stock: number }[];
  history: Hist[];
}) {
  const router = useRouter();
  const { toast, confirm } = useFeedback();
  const [lines, setLines] = useState<Line[]>(() => initialLines.map(toLine));
  const [other, setOther] = useState(remit.other_deductions ? String(remit.other_deductions) : "");
  const [note, setNote] = useState(remit.other_note);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const locked = remit.status === "paid";

  const parsed = useMemo(
    () =>
      lines.map((l) => ({
        order_id: l.order_id,
        customer: l.customer,
        product: l.product,
        qty: toNum(l.qty),
        order_value: toNum(l.order_value),
        amount_charged: toNum(l.amount_charged),
        type: l.type,
      })),
    [lines],
  );
  const s = remitSummary(parsed, toNum(other));
  // Saved when the remittance was sent or paid; live from the products until then.
  const frozen = Array.isArray(remit.stock_snapshot) ? remit.stock_snapshot : null;
  const stock = frozen ?? stockRemaining(products, parsed.map((l) => l.product));

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    if (!dirty.current || locked) return true;
    dirty.current = false;
    setSaveState("saving");
    try {
      const r = await saveRemittance(remit.id, parsed, other, note);
      setSaveState(r.ok ? "saved" : "error");
      if (!r.ok) toast(r.error);
      return r.ok;
    } catch {
      dirty.current = true;
      setSaveState("error");
      return false;
    }
  }, [remit.id, parsed, other, note, locked, toast]);

  // Autosave 700 ms after the last edit.
  useEffect(() => {
    if (!dirty.current) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 700);
    return () => clearTimeout(timer.current);
  }, [lines, other, note, flush]);

  // Warn before leaving with unsaved edits.
  useEffect(() => {
    const onLeave = (e: BeforeUnloadEvent) => {
      if (dirty.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, []);

  const edit = (id: string, k: keyof Line, v: string) => {
    dirty.current = true;
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, [k]: v } : l)));
  };
  const addLine = () => {
    dirty.current = true;
    const id = newId();
    setLines((ls) => [...ls, { id, order_id: null, customer: "", product: "", qty: "1", order_value: "0", amount_charged: "0", type: "Delivered" }]);
    requestAnimationFrame(() => document.getElementById(`c-${id}`)?.focus());
  };
  const removeLine = (id: string) => {
    const idx = lines.findIndex((l) => l.id === id);
    const line = lines[idx];
    dirty.current = true;
    setLines((ls) => ls.filter((l) => l.id !== id));
    toast("Line removed", () => {
      dirty.current = true;
      setLines((ls) => [...ls.slice(0, idx), line, ...ls.slice(idx)]);
    });
  };

  const rebuild = async () => {
    const ok = await confirm({
      title: "Rebuild from orders?",
      body: "This replaces the lines and other deductions with what the orders show now. Your edits will be lost.",
      ok: "Rebuild",
      danger: true,
    });
    if (!ok) return;
    dirty.current = false;
    const r = await generateRemittance(merchant.id, remit.remit_date);
    if (!r.ok) toast(r.error);
    router.refresh();
  };

  const markSent = async () => {
    if (remit.status !== "draft") return;
    await flush();
    const r = await setRemittanceStatus(remit.id, "sent");
    if (!r.ok) return toast(r.error);
    toast("Marked as sent");
    router.refresh();
  };

  const markPaid = async () => {
    const ok = await confirm({
      title: "Mark remittance as paid?",
      body: (
        <>
          Confirm you have paid <b>{naira(s.expected)}</b> to {merchant.name} for {dmy(remit.remit_date)}. The remittance locks after this.
        </>
      ),
      ok: "Mark as paid",
    });
    if (!ok) return;
    if (!(await flush())) return toast("Couldn’t save your last edits, so it wasn’t marked as paid. Try again.");
    const r = await setRemittanceStatus(remit.id, "paid");
    if (!r.ok) return toast(r.error);
    toast("Remittance marked as paid");
    router.refresh();
  };

  const pdf = async () => {
    try {
      await buildRemitPdf(merchant.name, remit.remit_date, s, note, parsed, stock);
    } catch {
      toast("Couldn’t make the PDF. Try again.");
    }
  };

  const text = remitText(merchant.name, remit.remit_date, s, note, stock);
  const waPhone = merchant.phone.replace(/\D/g, "").replace(/^0/, "234");
  const waHref = `https://wa.me/${waPhone}?text=${encodeURIComponent(text)}`;
  const mailHref = `mailto:${merchant.email}?subject=${encodeURIComponent(`Remittance for ${dmy(remit.remit_date)}`)}&body=${encodeURIComponent(text)}`;
  const owed = history.filter((h) => h.status === "sent").reduce((a, h) => a + h.expected, 0);
  const statusLabel = remit.status === "paid" ? "Paid" : remit.status === "sent" ? "Sent" : "Draft";
  const statusCls = remit.status === "paid" ? "st-Delivered" : remit.status === "sent" ? "st-Out" : "st-Pending";

  return (
    <div className="remit-layout">
      <div>
        <section className="panel">
          <div className="panel-h">
            <h2>Lines</h2>
            <span className="small muted">
              {lines.length} line{lines.length === 1 ? "" : "s"}
            </span>
            <span className="spacer" />
            {!locked && (
              <>
                <span className="small muted" role="status">
                  {saveState === "saving" ? "Saving…" : saveState === "error" ? "Not saved" : "Saved"}
                </span>
                <button className="btn sm" type="button" onClick={addLine}>
                  Add line
                </button>
                <button className="btn sm link" type="button" onClick={rebuild}>
                  Rebuild from orders
                </button>
              </>
            )}
          </div>
          {lines.length ? (
            <div className="tablewrap">
              <table className="cards">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Product</th>
                    <th className="num">Qty</th>
                    <th className="num">Order value</th>
                    <th className="num">Amount charged</th>
                    <th>Type</th>
                    <th>
                      <span className="sr">Remove</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.id}>
                      <td className="first" data-l="Customer">
                        <input className="input" id={`c-${l.id}`} aria-label="Customer" style={{ minWidth: 150 }} value={l.customer} readOnly={locked} onChange={(e) => edit(l.id, "customer", e.target.value)} />
                      </td>
                      <td data-l="Product">
                        <input className="input" aria-label="Product" style={{ minWidth: 170 }} list="rProd" value={l.product} readOnly={locked} onChange={(e) => edit(l.id, "product", e.target.value)} />
                      </td>
                      <td data-l="Qty">
                        <input className="input num" style={{ width: 60 }} aria-label="Quantity" inputMode="numeric" value={l.qty} readOnly={locked} onChange={(e) => edit(l.id, "qty", e.target.value)} />
                      </td>
                      <td data-l="Order value">
                        <input className="input num" style={{ width: 100 }} aria-label="Order value" inputMode="numeric" value={l.order_value} readOnly={locked} onChange={(e) => edit(l.id, "order_value", e.target.value)} />
                      </td>
                      <td data-l="Amount charged">
                        <input className="input num" style={{ width: 90 }} aria-label="Amount charged" inputMode="numeric" value={l.amount_charged} readOnly={locked} onChange={(e) => edit(l.id, "amount_charged", e.target.value)} />
                      </td>
                      <td data-l="Type">
                        <select className="input typesel" aria-label="Line type" value={l.type} disabled={locked} onChange={(e) => edit(l.id, "type", e.target.value as LineType)}>
                          {LINE_TYPES.map((t) => (
                            <option key={t}>{t}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        {!locked && (
                          <button className="icon-btn" type="button" aria-label={`Remove line for ${l.customer || "this customer"}`} onClick={() => removeLine(l.id)}>
                            <Icon name="x" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <datalist id="rProd">
                {products.map((p) => (
                  <option key={p.name} value={p.name} />
                ))}
              </datalist>
            </div>
          ) : (
            <div className="empty">
              <h3>No lines</h3>
              <p>Add a line for each delivered, waybill or failed order.</p>
            </div>
          )}
          <div className="panel-b" style={{ borderTop: "1px solid var(--line)" }}>
            <div className="grid2">
              <div className="field">
                <label htmlFor="rOther">Other deductions</label>
                <div className="money-in">
                  <span>₦</span>
                  <input
                    className="input"
                    id="rOther"
                    inputMode="numeric"
                    value={other}
                    readOnly={locked}
                    onChange={(e) => {
                      dirty.current = true;
                      setOther(e.target.value.replace(/[^\d,]/g, ""));
                    }}
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor="rNote">What it’s for</label>
                <input
                  className="input"
                  id="rNote"
                  placeholder="Optional, e.g. packaging"
                  value={note}
                  readOnly={locked}
                  onChange={(e) => {
                    dirty.current = true;
                    setNote(e.target.value);
                  }}
                />
              </div>
            </div>
            <p className="small muted" style={{ marginTop: 12 }}>
              Types are set from the order: a failed or returned status makes a line Failed; “waybill” in the customer name makes it Waybill. Fees use
              Amount charged; failed lines are charged 50%.
            </p>
          </div>
        </section>
        {history.length > 0 && (
          <section className="panel history" style={{ marginTop: 20 }}>
            <div className="panel-h">
              <h2>History</h2>
              <span className="spacer" />
              <span className="small">
                Outstanding: <b className="num">{naira(owed)}</b>
              </span>
            </div>
            <div className="panel-b" style={{ paddingTop: 4, paddingBottom: 4 }}>
              <ul>
                {history.map((h) => (
                  <li key={h.id}>
                    <span>{dmy(h.date)}</span>
                    <span className="num">{naira(h.expected)}</span>
                    <span className={`pill ${h.status === "paid" ? "st-Delivered" : "st-Out"}`}>{h.status === "paid" ? "Paid" : "Sent, not paid"}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}
      </div>
      <aside className="panel summary">
        <div className="panel-b">
          <span className="small muted">Expected remittance</span>
          <div className="bignum" aria-live="polite">
            {naira(s.expected)}
          </div>
          <span className="small muted">
            {merchant.name} · {dmy(remit.remit_date)}
          </span>
          <div className="sumrows">
            <div>
              <span>Money received</span>
              <span className="num">{naira(s.received)}</span>
            </div>
            <div>
              <span>Units delivered</span>
              <span className="num">{s.units}</span>
            </div>
            {Object.entries(s.byProduct).map(([p, n]) => (
              <div className="sub" key={p}>
                <span>{p}</span>
                <span className="num">{n}</span>
              </div>
            ))}
            <div className="minus">
              <span>Delivery fees</span>
              <span className="num">{naira(s.deliveryFees)}</span>
            </div>
            <div className="minus">
              <span>Waybill charges</span>
              <span className="num">{naira(s.waybillFees)}</span>
            </div>
            <div className="minus">
              <span>Failed fees (50%)</span>
              <span className="num">{naira(s.failedFees)}</span>
            </div>
            <div className="minus">
              <span>Other deductions</span>
              <span className="num">{naira(s.other)}</span>
            </div>
          </div>
          {stock.length > 0 && (
            <div className="sumrows" style={{ marginTop: 16 }}>
              <div style={{ fontWeight: 700 }}>
                <span>Stock remaining with Meld</span>
                <span className="small muted" style={{ fontWeight: 400 }}>
                  {frozen ? `as at ${remit.status}` : "live"}
                </span>
              </div>
              {stock.map((r) => (
                <div className="sub" key={r.product}>
                  <span>{r.product}</span>
                  <span className="num" style={r.stock <= 0 ? { color: "var(--danger)", fontWeight: 700 } : undefined}>
                    {r.stock}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="sendrow">
            <button className="btn" type="button" onClick={pdf}>
              <Icon name="dl" />
              PDF
            </button>
            {merchant.phone ? (
              <a className="btn" target="_blank" rel="noopener noreferrer" href={waHref} onClick={markSent}>
                <Icon name="wa" />
                WhatsApp
              </a>
            ) : (
              <button className="btn" type="button" disabled title="Add the merchant’s WhatsApp number in Merchant settings">
                <Icon name="wa" />
                WhatsApp
              </button>
            )}
            {merchant.email ? (
              <a className="btn" target="_blank" rel="noopener noreferrer" href={mailHref} onClick={markSent}>
                <Icon name="mail" />
                Email
              </a>
            ) : (
              <button className="btn" type="button" disabled title="Add the merchant’s email in Merchant settings">
                <Icon name="mail" />
                Email
              </button>
            )}
          </div>
          <p className="small muted" style={{ marginTop: 8 }}>
            WhatsApp and email send the summary to {merchant.name}. Attach the PDF if they want every line.
          </p>
          <div className="statusbar">
            <span className={`pill ${statusCls}`}>{statusLabel}</span>
            {remit.status === "draft" && (
              <button className="btn sm" type="button" onClick={markSent}>
                Mark as sent
              </button>
            )}
            {remit.status !== "paid" ? (
              <button className="btn sm dark" type="button" onClick={markPaid}>
                Mark as paid
              </button>
            ) : (
              <span className="small muted">Locked after payment</span>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
