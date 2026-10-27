"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { StatusPill } from "@/components/status-pill";
import { useFeedback } from "@/components/feedback";
import { STATUSES, charged, dmy, isValidPhone, markup, naira, normalisePhone, toNum } from "@/lib/calc";
import type { Draft } from "@/lib/extract";
import type { Merchant, Order, Product, Rider } from "@/lib/types";
import { deleteOrder, extract, saveOrder, type OrderInput } from "@/app/actions/orders";

type Form = Omit<Draft, "order_value" | "rider_fee"> & {
  order_value: string;
  rider_fee: string;
  rider_id: string;
  pickup_station: string;
  contact_customer: boolean;
  status: string;
};
type ErrKind = "empty" | "busy" | "timeout" | "failed" | "config";

const NOT_ON_CARD = "__none";
const MARKUP_HELP = "Rider fee + markup: under ₦3,000 adds ₦2,000; ₦3,000–4,999 adds ₦1,500; ₦5,000 and over adds ₦1,000";
const fmt = (v: string) => (v === "" ? "" : toNum(v).toLocaleString("en-NG"));

function blank(today: string, pickup: string): Form {
  return {
    delivery_date: today,
    customer: "",
    phone: "",
    address: "",
    area: "",
    product: "",
    qty: 1,
    order_value: "",
    rider_fee: "",
    fee_from_rate_card: false,
    payment: "Cash on delivery",
    notes: "",
    uncertain: [],
    rider_id: "",
    pickup_station: pickup,
    contact_customer: true,
    status: "Pending",
  };
}

export function NewOrder({
  merchant,
  today,
  products,
  rates,
  riders,
  todays,
}: {
  merchant: Merchant;
  today: string;
  products: Product[];
  rates: Record<string, number>;
  riders: Rider[];
  todays: Pick<Order, "id" | "customer" | "area" | "product" | "qty" | "order_value" | "status">[];
}) {
  const router = useRouter();
  const { toast, confirm } = useFeedback();
  const [paste, setPaste] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<{ kind: ErrKind; message?: string } | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const pasteRef = useRef<HTMLTextAreaElement>(null);
  const areas = Object.keys(rates).sort();

  const set = <K extends keyof Form>(k: K, v: Form[K]) =>
    setForm((f) => (f ? { ...f, [k]: v, uncertain: f.uncertain.filter((u) => u !== k) } : f));

  const runExtract = useCallback(async () => {
    const text = paste.trim();
    if (!text) return setErr({ kind: "empty" });
    setExtracting(true);
    setErr(null);
    try {
      const r = await extract(merchant.id, text);
      if (!r.ok) {
        setErr({ kind: r.kind, message: r.message });
        return;
      }
      const d = r.draft;
      setForm({
        ...blank(today, merchant.pickup_address),
        ...d,
        order_value: d.order_value === "" ? "" : String(d.order_value),
        rider_fee: d.rider_fee === "" ? "" : String(d.rider_fee),
      });
      requestAnimationFrame(() => {
        const el = document.querySelector<HTMLElement>(".field.unsure .input") ?? document.getElementById("f-customer");
        el?.focus();
      });
    } catch {
      setErr({ kind: "failed" });
    } finally {
      setExtracting(false);
    }
  }, [paste, merchant.id, merchant.pickup_address, today]);

  const doSave = useCallback(
    async () => {
      if (!form || saving) return;
      setSaving(true);
      const input: OrderInput = {
        merchant_id: merchant.id,
        delivery_date: form.delivery_date,
        customer: form.customer,
        phone: form.phone,
        address: form.address,
        area: form.area === NOT_ON_CARD ? "" : form.area,
        product: form.product,
        qty: form.qty,
        order_value: form.order_value,
        rider_fee: form.rider_fee,
        payment: form.payment,
        notes: form.notes,
        rider_id: form.rider_id,
        agent: "",
        pickup_station: form.pickup_station,
        contact_customer: form.contact_customer,
        status: form.status,
        raw_message: paste,
      };
      try {
        // A duplicate warning the user overrides sends the same order again with force.
        let r = await saveOrder(input, false);
        if (!r.ok && "duplicate" in r) {
          const d = r.duplicate;
          const again = await confirm({
            title: "Possible duplicate",
            body: (
              <>
                {form.customer} at this address already has order <b>{d.code}</b> from {dmy(d.date)} ({d.product} × {d.qty}, {d.status}).
              </>
            ),
            ok: "Save anyway",
          });
          if (!again) return;
          r = await saveOrder(input, true);
        }
        if (r.ok) {
          setForm(null);
          setPaste("");
          pasteRef.current?.focus();
          router.refresh();
          toast(
            <>
              Order <b>{r.code}</b> saved
            </>,
            async () => {
              const d = await deleteOrder(r.id);
              router.refresh();
              toast(d.ok ? `Order ${r.code} removed` : `Couldn’t remove ${r.code}: ${d.error}`);
            },
          );
        } else if ("error" in r) {
          toast(r.error);
        }
      } catch {
        toast("Couldn’t reach the server. Your order is still here; try again.");
      } finally {
        setSaving(false);
      }
    },
    [form, saving, merchant.id, paste, router, toast, confirm],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === "Enter" && !extracting) {
        e.preventDefault();
        void runExtract();
      }
      if ((e.key === "s" || e.key === "S") && form) {
        e.preventDefault();
        void doSave();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [runExtract, doSave, extracting, form]);

  const manual = () => {
    setErr(null);
    setForm(blank(today, merchant.pickup_address));
    requestAnimationFrame(() => document.getElementById("f-customer")?.focus());
  };

  let errBox: ReactNode = null;
  if (err) {
    const retry = (
      <div className="act">
        <button className="btn sm" type="button" onClick={runExtract}>
          Try again
        </button>
        <button className="btn sm" type="button" onClick={manual}>
          Fill in by hand
        </button>
      </div>
    );
    if (err.kind === "empty")
      errBox = (
        <div className="callout info">
          <Icon name="info" />
          <div>Paste a WhatsApp order message first.</div>
        </div>
      );
    else if (err.kind === "busy")
      errBox = (
        <div className="callout warn" role="alert">
          <Icon name="warn" />
          <div>
            <b>Extraction is busy.</b> Too many requests went out at once. Wait a moment, then try again.
            {retry}
          </div>
        </div>
      );
    else
      errBox = (
        <div className="callout err" role="alert">
          <Icon name="warn" />
          <div>
            <b>{err.kind === "timeout" ? "Extraction timed out." : err.kind === "config" ? "Extraction isn’t set up." : "Extraction failed."}</b>{" "}
            Your message is still here.
            {err.kind === "config" && <div className="small muted">{err.message}</div>}
            {retry}
          </div>
        </div>
      );
  }

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>New order</h1>
          <p>Paste one WhatsApp message for {merchant.name}. Check what’s flagged, then save.</p>
        </div>
      </div>
      <div className="order-layout">
        <div>
          <section className="panel">
            <div className="panel-b">
              <label htmlFor="paste" className="lbl" style={{ display: "block", marginBottom: 6 }}>
                WhatsApp message
              </label>
              <textarea
                ref={pasteRef}
                className="input paste"
                id="paste"
                placeholder="Paste the order message here"
                readOnly={extracting}
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                autoFocus
              />
              <div className="paste-actions">
                <button className="btn primary" type="button" onClick={runExtract} disabled={extracting}>
                  {extracting ? (
                    <>
                      <span className="spin" aria-hidden="true" />
                      Extracting…
                    </>
                  ) : (
                    "Extract order"
                  )}
                </button>
                <button className="btn link" type="button" onClick={manual}>
                  Fill in by hand
                </button>
              </div>
              <p className="kbd" style={{ marginTop: 8 }}>
                <kbd>Ctrl</kbd>+<kbd>Enter</kbd> extracts
              </p>
              {errBox && <div style={{ marginTop: 12 }}>{errBox}</div>}
            </div>
          </section>
          {form && (
            <ReviewForm form={form} set={set} areas={areas} rates={rates} products={products} riders={riders} saving={saving} onSave={() => doSave()} onDiscard={() => { setForm(null); pasteRef.current?.focus(); }} />
          )}
        </div>
        <aside className="panel recent" aria-labelledby="todayH">
          <div className="panel-h">
            <h2 id="todayH">Today’s orders</h2>
            <span className="spacer" />
            <span className="small muted">
              {todays.length} for {merchant.name}
            </span>
          </div>
          <div className="panel-b" style={{ paddingTop: 4, paddingBottom: 4 }}>
            {todays.length ? (
              <ul>
                {todays.map((o) => (
                  <li key={o.id}>
                    <div>
                      <b>{o.customer}</b>
                      <div className="small muted">
                        {o.area || "No area"} · {o.product} × {o.qty}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div className="num">{naira(o.order_value)}</div>
                      <StatusPill status={o.status} />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="empty">
                <h3>No orders yet today</h3>
                <p>Orders you save appear here so you can spot mistakes.</p>
              </div>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}

function Field({
  k,
  label,
  form,
  className,
  after,
  children,
}: {
  k: string;
  label: string;
  form: Form;
  className?: string;
  after?: ReactNode;
  children: ReactNode;
}) {
  const unsure = form.uncertain.includes(k);
  return (
    <div className={`field${unsure ? " unsure" : ""}${className ? " " + className : ""}`}>
      <div className="lblrow">
        <label htmlFor={`f-${k}`} className="lbl">
          {label}
          {unsure && (
            <span className="flag">
              <Icon name="flag" />
              Check
            </span>
          )}
        </label>
      </div>
      {children}
      {after}
    </div>
  );
}

function ReviewForm({
  form,
  set,
  areas,
  rates,
  products,
  riders,
  saving,
  onSave,
  onDiscard,
}: {
  form: Form;
  set: <K extends keyof Form>(k: K, v: Form[K]) => void;
  areas: string[];
  rates: Record<string, number>;
  products: Product[];
  riders: Rider[];
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
}) {
  const fee = toNum(form.rider_fee);
  const phone = normalisePhone(form.phone);
  const phoneBad = form.phone !== "" && !isValidPhone(phone);
  const notOnCard = form.area === NOT_ON_CARD;
  const src = !form.fee_from_rate_card
    ? form.rider_fee
      ? "Entered by hand"
      : form.area && !notOnCard
        ? ""
        : "Pick an area to look up the rate"
    : null;

  return (
    <section className="panel" aria-labelledby="revH" style={{ marginTop: 20 }}>
      <div className="panel-h">
        <h2 id="revH">Check the order</h2>
        <span className="spacer" />
        {form.uncertain.length ? (
          <span className="flag">
            <Icon name="flag" />
            {form.uncertain.length} to check
          </span>
        ) : (
          <span className="small muted">All fields filled</span>
        )}
      </div>
      <div className="panel-b">
        <div className="grid2">
          <Field k="customer" label="Customer name" form={form}>
            <input className="input" id="f-customer" value={form.customer} onChange={(e) => set("customer", e.target.value)} autoComplete="off" />
          </Field>
          <Field
            k="phone"
            label="Phone number"
            form={form}
            className={phoneBad ? "bad" : ""}
            after={
              phoneBad ? (
                <span className="err" id="phErr">
                  Use an 11-digit number starting 070, 080, 081, 090 or 091.
                </span>
              ) : (
                <span className="hint" id="phErr">
                  11 digits, e.g. 08031234567
                </span>
              )
            }
          >
            <input
              className="input"
              id="f-phone"
              inputMode="tel"
              aria-describedby="phErr"
              aria-invalid={phoneBad}
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
              onBlur={() => form.phone && set("phone", normalisePhone(form.phone))}
            />
          </Field>
          <Field k="address" label="Delivery address" form={form} className="span2">
            <textarea className="input" id="f-address" rows={2} value={form.address} onChange={(e) => set("address", e.target.value)} />
          </Field>
          <Field k="area" label="Area" form={form}>
            <select
              className="input"
              id="f-area"
              value={form.area}
              onChange={(e) => {
                const a = e.target.value;
                set("area", a);
                const known = a && a !== NOT_ON_CARD && rates[a] != null;
                set("rider_fee", known ? String(rates[a]) : "");
                set("fee_from_rate_card", Boolean(known));
              }}
            >
              <option value="">Choose area</option>
              {areas.map((a) => (
                <option key={a}>{a}</option>
              ))}
              <option value={NOT_ON_CARD}>Not on rate card</option>
            </select>
          </Field>
          <Field k="delivery_date" label="Delivery date" form={form}>
            <input className="input" type="date" id="f-delivery_date" value={form.delivery_date} onChange={(e) => set("delivery_date", e.target.value)} />
          </Field>
          <Field k="product" label="Product" form={form}>
            <input
              className="input"
              id="f-product"
              list="prodList"
              placeholder="Search products"
              value={form.product}
              onChange={(e) => {
                const name = e.target.value;
                set("product", name);
                const p = products.find((x) => x.name === name);
                if (p && !form.order_value) set("order_value", String(p.price * (Number(form.qty) || 1)));
              }}
            />
            <datalist id="prodList">
              {products.map((p) => (
                <option key={p.id} value={p.name}>
                  {naira(p.price)}
                </option>
              ))}
            </datalist>
          </Field>
          <div className="grid2" style={{ gap: 14 }}>
            <Field k="qty" label="Quantity" form={form}>
              <input className="input" type="number" min={1} id="f-qty" value={form.qty} onChange={(e) => set("qty", Number(e.target.value) || 1)} />
            </Field>
            <Field k="order_value" label="Order value" form={form}>
              <div className="money-in">
                <span>₦</span>
                <input
                  className="input"
                  inputMode="numeric"
                  id="f-order_value"
                  value={form.order_value}
                  onChange={(e) => set("order_value", e.target.value.replace(/[^\d,]/g, ""))}
                  onBlur={() => set("order_value", fmt(form.order_value))}
                />
              </div>
            </Field>
          </div>
          <Field
            k="rider_fee"
            label="Delivery cost"
            form={form}
            className={notOnCard && !fee ? "bad" : ""}
            after={
              <>
                <span className="costsrc">
                  {notOnCard && !fee ? (
                    <span className="err">Area isn’t on the rate card. Enter the cost by hand.</span>
                  ) : src === null ? (
                    <>
                      From rate card:{" "}
                      <b>
                        {form.area} {naira(rates[form.area])}
                      </b>
                    </>
                  ) : (
                    src
                  )}
                </span>
                {fee > 0 && (
                  <span className="costsrc">
                    Merchant is charged <b>{naira(charged(fee))}</b>{" "}
                    <span className="tag" title={MARKUP_HELP}>
                      auto
                    </span>
                    <span className="sr"> (rider fee plus {naira(markup(fee))} markup)</span>
                  </span>
                )}
              </>
            }
          >
            <div className="money-in">
              <span>₦</span>
              <input
                className="input"
                inputMode="numeric"
                id="f-rider_fee"
                value={form.rider_fee}
                onChange={(e) => {
                  set("rider_fee", e.target.value.replace(/[^\d,]/g, ""));
                  set("fee_from_rate_card", false);
                }}
                onBlur={() => set("rider_fee", fmt(form.rider_fee))}
              />
            </div>
          </Field>
          <Field k="payment" label="Payment" form={form}>
            <select className="input" id="f-payment" value={form.payment} onChange={(e) => set("payment", e.target.value as Form["payment"])}>
              <option>Cash on delivery</option>
              <option>Already paid</option>
            </select>
          </Field>
          <Field k="notes" label="Delivery notes" form={form} className="span2">
            <input className="input" id="f-notes" value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </Field>
          <Field k="rider_id" label="Rider" form={form}>
            <select className="input" id="f-rider_id" value={form.rider_id} onChange={(e) => set("rider_id", e.target.value)}>
              <option value="">Assign later</option>
              {riders.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </Field>
          <Field k="contact_customer" label="Contact customer first" form={form}>
            <select
              className="input"
              id="f-contact_customer"
              value={form.contact_customer ? "Yes" : "No"}
              onChange={(e) => set("contact_customer", e.target.value === "Yes")}
            >
              <option>Yes</option>
              <option>No</option>
            </select>
          </Field>
          <Field k="pickup_station" label="Pickup station" form={form}>
            <input className="input" id="f-pickup_station" value={form.pickup_station} onChange={(e) => set("pickup_station", e.target.value)} />
          </Field>
          <Field k="status" label="Status" form={form}>
            <select className="input" id="f-status" value={form.status} onChange={(e) => set("status", e.target.value)}>
              {STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="formfoot">
          <button className="btn primary" type="button" onClick={onSave} disabled={saving}>
            {saving && <span className="spin" aria-hidden="true" />}
            Save order
          </button>
          <button className="btn" type="button" onClick={onDiscard}>
            Discard
          </button>
          <span className="kbd">
            <kbd>Tab</kbd> next field · <kbd>Ctrl</kbd>+<kbd>S</kbd> save
          </span>
        </div>
      </div>
    </section>
  );
}
