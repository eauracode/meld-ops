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
