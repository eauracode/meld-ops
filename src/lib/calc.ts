// Pure business rules shared by the server and the browser.
// The markup rule is mirrored in supabase/schema.sql (orders.amount_charged); keep them in step.

export const PHONE_RE = /^0(70|80|81|90|91)\d{8}$/;

export const STATUSES = [
  "Pending",
  "Out for delivery",
  "Delivered",
  "Failed",
  "Returned",
  "Rescheduled",
] as const;
export type OrderStatus = (typeof STATUSES)[number];

export const PAYMENTS = ["Cash on delivery", "Already paid"] as const;
export type Payment = (typeof PAYMENTS)[number];

export const LINE_TYPES = ["Delivered", "Waybill", "Failed"] as const;
export type LineType = (typeof LINE_TYPES)[number];

/** Share of the amount charged that a failed or returned delivery costs the merchant. */
export const FAILED_FEE_SHARE = 0.5;

/** Markup Meld adds to the rider fee: under ₦3,000 adds ₦2,000; under ₦5,000 adds ₦1,500; otherwise ₦1,000. */
export function markup(riderFee: number): number {
  if (riderFee < 3000) return 2000;
  if (riderFee < 5000) return 1500;
  return 1000;
}

/** What the merchant is charged for one delivery. No rider fee means nothing to charge yet. */
export function charged(riderFee: number | null | undefined): number {
  const fee = Number(riderFee) || 0;
  return fee > 0 ? fee + markup(fee) : 0;
}

/** Parses "₦17,000", "17k", "17000.00" and similar into a number; anything else is 0. */
export function toNum(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return 0;
  const thousands = /^\D*[\d,.]+\s*k$/.test(s);
  const n = Number(s.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n)) return 0;
  return thousands ? n * 1000 : n;
}

/** Normalises +234 / 234 / spaced numbers to the 11-digit local form. Returns "" if nothing usable. */
export function normalisePhone(raw: string | null | undefined): string {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.startsWith("234") && d.length === 13) d = "0" + d.slice(3);
  if (d.length === 10 && /^[789]/.test(d)) d = "0" + d;
  return d;
}

export function isValidPhone(p: string): boolean {
  return PHONE_RE.test(p);
}

/** Remittance line type set from the order: failed/returned status wins, then "waybill" in the name. */
export function autoLineType(status: string, customer: string): LineType {
  if (/fail|return/i.test(status)) return "Failed";
  if (/waybill/i.test(customer)) return "Waybill";
  return "Delivered";
}

export type RemitLine = {
  customer: string;
  product: string;
  qty: number;
  order_value: number;
  amount_charged: number;
  type: LineType;
};

export type RemitSummary = {
  received: number;
  units: number;
  byProduct: Record<string, number>;
  deliveryFees: number;
  waybillFees: number;
  failedFees: number;
  other: number;
  expected: number;
};

/** Expected remittance = money received − delivery fees − waybill charges − failed fees − other deductions. */
export function remitSummary(lines: RemitLine[], otherDeductions: number): RemitSummary {
  const s: RemitSummary = {
    received: 0,
    units: 0,
    byProduct: {},
    deliveryFees: 0,
    waybillFees: 0,
    failedFees: 0,
    other: toNum(otherDeductions),
    expected: 0,
  };
  for (const l of lines) {
    const value = toNum(l.order_value);
    const fee = toNum(l.amount_charged);
    const qty = toNum(l.qty);
    if (l.type === "Failed") {
      s.failedFees += Math.round(fee * FAILED_FEE_SHARE);
      continue;
    }
    s.received += value;
    s.units += qty;
    const p = l.product || "Unknown";
    s.byProduct[p] = (s.byProduct[p] ?? 0) + qty;
    if (l.type === "Waybill") s.waybillFees += fee;
    else s.deliveryFees += fee;
  }
  s.expected = s.received - s.deliveryFees - s.waybillFees - s.failedFees - s.other;
  return s;
}

export type ReportRow = {
  order_value: number;
  rider_fee: number;
  amount_charged: number;
  rider_id: string | null;
  product: string;
  qty: number;
};

type Tally = { deliveries: number; orderValue: number; charged: number; riderFees: number; revenue: number };

export type ReportTotals = Tally & {
  units: number;
  byProduct: Record<string, number>;
  /** Keyed by rider id; "" holds unassigned deliveries. */
  byRider: Record<string, Tally>;
};

const emptyTally = (): Tally => ({ deliveries: 0, orderValue: 0, charged: 0, riderFees: 0, revenue: 0 });

/** Delivery report totals. Revenue = amount charged − rider fee, per delivery. */
export function reportTotals(rows: ReportRow[]): ReportTotals {
  const t: ReportTotals = { ...emptyTally(), units: 0, byProduct: {}, byRider: {} };
  for (const r of rows) {
    const fee = toNum(r.rider_fee);
    const ch = toNum(r.amount_charged);
    const value = toNum(r.order_value);
    const qty = toNum(r.qty);
    for (const tally of [t, (t.byRider[r.rider_id ?? ""] ??= emptyTally())]) {
      tally.deliveries += 1;
      tally.orderValue += value;
      tally.charged += ch;
      tally.riderFees += fee;
      tally.revenue += ch - fee;
    }
    t.units += qty;
    const p = r.product || "Unknown";
    t.byProduct[p] = (t.byProduct[p] ?? 0) + qty;
  }
  return t;
}

// ---------- overview dashboard ----------

export type Period = "day" | "week" | "month" | "year";
export type Grain = "day" | "month";

/** The period containing `anchor`: [from, to] inclusive, weeks starting Monday. */
export function periodRange(period: Period, anchor: string): { from: string; to: string } {
  const [y, m] = anchor.split("-").map(Number);
  if (period === "day") return { from: anchor, to: anchor };
  if (period === "week") {
    const dow = (new Date(anchor + "T12:00:00Z").getUTCDay() + 6) % 7; // Monday = 0
    const from = addDays(anchor, -dow);
    return { from, to: addDays(from, 6) };
  }
  if (period === "month") {
    const from = `${y}-${String(m).padStart(2, "0")}-01`;
    return { from, to: addDays(m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`, -1) };
  }
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

/** Same period, one step back or forward. */
export function shiftPeriod(period: Period, anchor: string, step: -1 | 1): string {
  const { from } = periodRange(period, anchor);
  if (period === "day") return addDays(anchor, step);
  if (period === "week") return addDays(from, 7 * step);
  const [y, m] = from.split("-").map(Number);
  if (period === "year") return `${y + step}-01-01`;
  const mm = m + step;
  return mm < 1 ? `${y - 1}-12-01` : mm > 12 ? `${y + 1}-01-01` : `${y}-${String(mm).padStart(2, "0")}-01`;
}

export type DashOrder = {
  delivery_date: string;
  merchant_id: string;
  rider_id: string | null;
  status: string;
  order_value: number;
  rider_fee: number;
  amount_charged: number;
  payment: string;
  area: string;
};

export type DashTally = {
  orders: number;
  delivered: number;
  failed: number;
  orderValue: number;
  charged: number;
  riderFees: number;
  revenue: number;
};

export type DashStats = DashTally & {
  open: number;
  cashCollected: number;
  /** delivered ÷ (delivered + failed); null when nothing was finished. */
  successRate: number | null;
  byStatus: Record<string, number>;
  byMerchant: Record<string, DashTally>;
  /** Keyed by rider id; "" holds unassigned orders. */
  byRider: Record<string, DashTally>;
  byArea: { area: string; delivered: number }[];
  trend: { key: string; delivered: number; failed: number }[];
};

const isFailed = (s: string) => s === "Failed" || s === "Returned";
const blankTally = (): DashTally => ({ orders: 0, delivered: 0, failed: 0, orderValue: 0, charged: 0, riderFees: 0, revenue: 0 });

/** Every bucket key from `from` to `to`: each day, or each month (YYYY-MM). */
export function trendKeys(from: string, to: string, grain: Grain): string[] {
  const keys: string[] = [];
  if (grain === "day") for (let d = from; d <= to; d = addDays(d, 1)) keys.push(d);
  else for (let d = from.slice(0, 7) + "-01"; d <= to; d = shiftPeriod("month", d, 1)) keys.push(d.slice(0, 7));
  return keys;
}

/**
 * Overview figures for a set of orders. Money (order value, charges, revenue) counts Delivered only;
 * cash collected is Delivered and cash on delivery. Revenue = amount charged − rider fee.
 */
export function dashboardStats(orders: DashOrder[], from: string, to: string, grain: Grain): DashStats {
  const s: DashStats = { ...blankTally(), open: 0, cashCollected: 0, successRate: null, byStatus: {}, byMerchant: {}, byRider: {}, byArea: [], trend: [] };
  const trend = new Map(trendKeys(from, to, grain).map((k) => [k, { key: k, delivered: 0, failed: 0 }]));
  const areas: Record<string, number> = {};

  for (const o of orders) {
    const delivered = o.status === "Delivered";
    const failed = isFailed(o.status);
    s.byStatus[o.status] = (s.byStatus[o.status] ?? 0) + 1;
    if (!delivered && !failed) s.open += 1;
    if (delivered && /cash/i.test(o.payment)) s.cashCollected += toNum(o.order_value);

    for (const t of [s, (s.byMerchant[o.merchant_id] ??= blankTally()), (s.byRider[o.rider_id ?? ""] ??= blankTally())]) {
      t.orders += 1;
      if (failed) t.failed += 1;
      if (delivered) {
        t.delivered += 1;
        t.orderValue += toNum(o.order_value);
        t.charged += toNum(o.amount_charged);
        t.riderFees += toNum(o.rider_fee);
        t.revenue += toNum(o.amount_charged) - toNum(o.rider_fee);
      }
    }

    if (delivered && o.area) areas[o.area] = (areas[o.area] ?? 0) + 1;
    const bucket = trend.get(grain === "day" ? o.delivery_date : o.delivery_date.slice(0, 7));
    if (bucket && delivered) bucket.delivered += 1;
    if (bucket && failed) bucket.failed += 1;
  }

  const finished = s.delivered + s.failed;
  s.successRate = finished ? s.delivered / finished : null;
  s.byArea = Object.entries(areas)
    .map(([area, delivered]) => ({ area, delivered }))
    .sort((a, b) => b.delivered - a.delivered || a.area.localeCompare(b.area));
  s.trend = [...trend.values()];
  return s;
}

/** Percentage change, or null when there's nothing to compare with. */
export function change(now: number, before: number): number | null {
  return before ? (now - before) / before : null;
}

export type StockRow = { product: string; stock: number };

/**
 * Stock a merchant still holds with Meld, for the remittance. Empty when they keep no stock with us
 * (every product at zero). Otherwise lists products with stock, plus any sold out in this remittance.
 */
export function stockRemaining(products: { name: string; stock: number }[], soldProducts: string[]): StockRow[] {
  if (!products.some((p) => toNum(p.stock) !== 0)) return [];
  const sold = new Set(soldProducts.map((p) => p.toLowerCase()));
  return products
    .filter((p) => toNum(p.stock) !== 0 || sold.has(p.name.toLowerCase()))
    .map((p) => ({ product: p.name, stock: Math.round(toNum(p.stock)) }))
    .sort((a, b) => a.product.localeCompare(b.product));
}

/** Closest product by shared words; "" when nothing overlaps. */
export function matchProduct(extracted: string | null | undefined, products: string[]): string {
  const text = String(extracted ?? "").toLowerCase().trim();
  if (!text || !products.length) return "";
  const exact = products.find((p) => p.toLowerCase() === text);
  if (exact) return exact;
  const textWords = text.split(/\s+/).filter((w) => w.length > 1);
  let best = "";
  let bestScore = 0;
  for (const p of products) {
    const words = p.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
    if (!words.length) continue;
    const hits = words.filter((w) => text.includes(w)).length + textWords.filter((w) => p.toLowerCase().includes(w)).length;
    const score = hits / (words.length + textWords.length);
    if (score > bestScore) {
      best = p;
      bestScore = score;
    }
  }
  return bestScore > 0 ? best : "";
}

/** Rate card lookup by area: exact match first, then the longest area name contained either way. */
export function lookupRate(area: string | null | undefined, rates: Record<string, number>): { area: string; fee: number } | null {
  const zone = String(area ?? "").toLowerCase().trim();
  if (!zone) return null;
  const keys = Object.keys(rates);
  const exact = keys.find((k) => k.toLowerCase() === zone);
  if (exact) return { area: exact, fee: rates[exact] };
  const partial = keys
    .filter((k) => zone.includes(k.toLowerCase()) || k.toLowerCase().includes(zone))
    .sort((a, b) => b.length - a.length)[0];
  return partial ? { area: partial, fee: rates[partial] } : null;
}

export function naira(n: number | null | undefined): string {
  return "₦" + Math.round(Number(n) || 0).toLocaleString("en-NG");
}

/** "2026-10-27" → "27/10/2026" */
export function dmy(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/** Today's date in Lagos as YYYY-MM-DD, regardless of the server's time zone. */
export function lagosToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(now);
}

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
