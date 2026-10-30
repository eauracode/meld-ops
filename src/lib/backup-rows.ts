// Turns database rows into the backup sheet's tabs: one header row, then plain values, with names
// in place of ids. Pure, so it is tested without a database or Google.
import { dmy, remitSummary, type LineType } from "./calc";
import { orderCode } from "./types";

type Rec = Record<string, unknown>;
export type Cell = string | number;
export type Tab = { name: string; rows: Cell[][] };

export type BackupData = {
  orders: Rec[];
  merchants: Rec[];
  products: Rec[];
  rates: Rec[];
  riders: Rec[];
  remittances: Rec[];
  remittanceLines: Rec[];
  riderPayouts: Rec[];
  stations: Rec[];
  stationStock: Rec[];
  stockMoves: Rec[];
  profiles: Rec[];
};

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const n = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);

/** ISO timestamp → "dd/mm/yyyy hh:mm" in Lagos time; "" when empty. */
export function lagosTime(iso: unknown): string {
  if (!iso) return "";
  const t = new Date(String(iso));
  if (Number.isNaN(t.getTime())) return "";
  const day = t.toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
  const time = t.toLocaleTimeString("en-GB", { timeZone: "Africa/Lagos", hour: "2-digit", minute: "2-digit" });
  return `${dmy(day)} ${time}`;
}

const lookup = (rows: Rec[], label: (r: Rec) => string) => {
  const m = new Map(rows.map((r) => [s(r.id), label(r)]));
  return (id: unknown) => (id ? (m.get(s(id)) ?? "") : "");
};

export function buildTabs(d: BackupData, now: Date = new Date()): Tab[] {
  const merchant = lookup(d.merchants, (r) => s(r.name));
  const rider = lookup(d.riders, (r) => s(r.name));
  const station = lookup(d.stations, (r) => s(r.name));
  const person = lookup(d.profiles, (r) => s(r.name) || s(r.email));
  const product = lookup(d.products, (r) => s(r.name));
  const byId = <T extends Rec>(a: T[], k: string) => [...a].sort((x, y) => s(x[k]).localeCompare(s(y[k])));

  const orders: Tab = {
    name: "Orders",
    rows: [
      ["Order", "Delivery date", "Merchant", "Customer", "Phone", "Address", "Area", "Station", "Pickup", "Product", "Qty", "Order value", "Rider fee", "Amount charged", "Revenue", "Payment", "Status", "Rider", "Rider paid", "Notes", "Created"],
      ...[...d.orders]
        .sort((a, b) => n(a.id) - n(b.id))
        .map((o) => [
          orderCode(n(o.id)),
          dmy(s(o.delivery_date)),
          merchant(o.merchant_id),
          s(o.customer),
          s(o.phone),
          s(o.address),
          s(o.area),
          station(o.station_id),
          s(o.pickup_station),
          s(o.product),
          n(o.qty),
          n(o.order_value),
          n(o.rider_fee),
          n(o.amount_charged),
          n(o.amount_charged) - n(o.rider_fee),
          s(o.payment),
          s(o.status),
          rider(o.rider_id),
          o.rider_payout_id ? "Yes" : "",
          s(o.notes),
          lagosTime(o.created_at),
        ]),
    ],
  };

  const linesBy = new Map<string, Rec[]>();
  for (const l of d.remittanceLines) {
    const k = s(l.remittance_id);
    linesBy.set(k, [...(linesBy.get(k) ?? []), l]);
  }
  const remitLabel = new Map(d.remittances.map((r) => [s(r.id), `${merchant(r.merchant_id)} ${dmy(s(r.remit_date))}`]));

  const remittances: Tab = {
    name: "Remittances",
    rows: [
      ["Merchant", "Date", "Status", "Money received", "Delivery fees", "Waybill charges", "Failed fees", "Other deductions", "Other note", "Expected remittance", "Sent", "Paid"],
      ...byId(d.remittances, "remit_date").map((r) => {
        const lines = (linesBy.get(s(r.id)) ?? []).map((l) => ({
          customer: s(l.customer),
          product: s(l.product),
          qty: n(l.qty),
          order_value: n(l.order_value),
          amount_charged: n(l.amount_charged),
          type: s(l.type) as LineType,
        }));
        const t = remitSummary(lines, n(r.other_deductions));
        return [merchant(r.merchant_id), dmy(s(r.remit_date)), s(r.status), t.received, t.deliveryFees, t.waybillFees, t.failedFees, t.other, s(r.other_note), t.expected, lagosTime(r.sent_at), lagosTime(r.paid_at)];
      }),
    ],
  };

  const remittanceLines: Tab = {
    name: "Remittance lines",
    rows: [
      ["Remittance", "Order", "Customer", "Product", "Qty", "Order value", "Amount charged", "Type"],
      ...[...d.remittanceLines]
        .sort((a, b) => s(remitLabel.get(s(a.remittance_id))).localeCompare(s(remitLabel.get(s(b.remittance_id)))) || n(a.position) - n(b.position))
        .map((l) => [
          remitLabel.get(s(l.remittance_id)) ?? "",
          l.order_id ? orderCode(n(l.order_id)) : "",
          s(l.customer),
          s(l.product),
          n(l.qty),
          n(l.order_value),
          n(l.amount_charged),
          s(l.type),
        ]),
    ],
  };

  const merchants: Tab = {
    name: "Merchants",
    rows: [["Merchant", "Phone", "Email", "Pickup address", "Default station"], ...byId(d.merchants, "name").map((m) => [s(m.name), s(m.phone), s(m.email), s(m.pickup_address), station(m.default_station_id)])],
  };

  const stockAt = new Map(d.stationStock.map((x) => [`${s(x.product_id)}|${s(x.station_id)}`, n(x.qty)]));
  const stationCols = d.stations;
  const stock: Tab = {
    name: "Stock",
    rows: [
      ["Merchant", "Product", "Price", ...stationCols.map((st) => s(st.name)), "Total"],
      ...[...d.products]
        .sort((a, b) => merchant(a.merchant_id).localeCompare(merchant(b.merchant_id)) || s(a.name).localeCompare(s(b.name)))
        .map((p) => [merchant(p.merchant_id), s(p.name), n(p.price), ...stationCols.map((st) => stockAt.get(`${s(p.id)}|${s(st.id)}`) ?? 0), n(p.stock)]),
    ],
  };

  const stockLog: Tab = {
    name: "Stock log",
    rows: [
      ["When", "Merchant", "Product", "What", "Units", "From", "To", "Order", "Note", "By"],
      ...byId(d.stockMoves, "created_at").map((m) => [
        lagosTime(m.created_at),
        merchant(m.merchant_id),
        s(m.product) || product(m.product_id),
        s(m.kind),
        n(m.qty),
        station(m.from_station),
        station(m.to_station),
        m.order_id ? orderCode(n(m.order_id)) : "",
        s(m.note),
        person(m.created_by),
      ]),
    ],
  };

  const riders: Tab = { name: "Riders", rows: [["Rider", "Phone", "Active"], ...byId(d.riders, "name").map((r) => [s(r.name), s(r.phone), r.active ? "Yes" : "No"])] };

  const riderPayments: Tab = {
    name: "Rider payments",
    rows: [
      ["Paid on", "Rider", "Deliveries from", "Deliveries to", "Orders", "Amount", "Paid by"],
      ...byId(d.riderPayouts, "paid_at").map((p) => [lagosTime(p.paid_at), rider(p.rider_id), dmy(s(p.period_from)), dmy(s(p.period_to)), n(p.orders), n(p.amount), person(p.paid_by)]),
    ],
  };

  const rates: Tab = {
    name: "Rate cards",
    rows: [
      ["Merchant", "Area", "Rider fee"],
      ...[...d.rates].sort((a, b) => merchant(a.merchant_id).localeCompare(merchant(b.merchant_id)) || s(a.area).localeCompare(s(b.area))).map((r) => [merchant(r.merchant_id), s(r.area), n(r.rider_fee)]),
    ],
  };

  const stations: Tab = { name: "Stations", rows: [["Station", "Address", "Active"], ...d.stations.map((st) => [s(st.name), s(st.address), st.active ? "Yes" : "No"])] };

  const data = [orders, remittances, remittanceLines, merchants, stock, stockLog, riders, riderPayments, rates, stations];
  const about: Tab = {
    name: "About",
    rows: [
      ["Meld Ops backup", ""],
      ["Last updated (Lagos)", lagosTime(now.toISOString())],
      ["", ""],
      ["Tab", "Rows"],
      ...data.map((t) => [t.name, t.rows.length - 1]),
      ["", ""],
      ["Rewritten in full every night from the app’s database. Download: File → Download → Microsoft Excel.", ""],
    ],
  };
  return [about, ...data];
}
