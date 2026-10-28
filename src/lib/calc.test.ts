import { describe, expect, it } from "vitest";
import {
  addDays,
  autoLineType,
  charged,
  dmy,
  lagosToday,
  lookupRate,
  markup,
  matchProduct,
  naira,
  normalisePhone,
  isValidPhone,
  remitSummary,
  reportTotals,
  stockRemaining,
  toNum,
  type RemitLine,
} from "./calc";

describe("markup rule", () => {
  it("adds ₦2,000 under ₦3,000, ₦1,500 under ₦5,000, ₦1,000 from ₦5,000", () => {
    expect(markup(2999)).toBe(2000);
    expect(markup(3000)).toBe(1500);
    expect(markup(4999)).toBe(1500);
    expect(markup(5000)).toBe(1000);
  });
  it("charges rider fee + markup, and nothing without a fee", () => {
    expect(charged(2500)).toBe(4500);
    expect(charged(3500)).toBe(5000);
    expect(charged(6000)).toBe(7000);
    expect(charged(0)).toBe(0);
    expect(charged(null)).toBe(0);
  });
});

describe("parsing", () => {
  it("reads naira amounts", () => {
    expect(toNum("₦17,000")).toBe(17000);
    expect(toNum("17k")).toBe(17000);
    expect(toNum("2.5k")).toBe(2500);
    expect(toNum("")).toBe(0);
    expect(toNum("abc")).toBe(0);
    expect(toNum(1200)).toBe(1200);
  });
  it("normalises Nigerian phone numbers", () => {
    expect(normalisePhone("0803 456 7890")).toBe("08034567890");
    expect(normalisePhone("+234 803 456 7890")).toBe("08034567890");
    expect(normalisePhone("8034567890")).toBe("08034567890");
    expect(isValidPhone("08034567890")).toBe(true);
    expect(isValidPhone("06034567890")).toBe(false);
    expect(isValidPhone("0803456789")).toBe(false);
  });
});

describe("remittance", () => {
  it("types lines from status and name", () => {
    expect(autoLineType("Failed", "Ada")).toBe("Failed");
    expect(autoLineType("Returned", "Waybill – Abuja")).toBe("Failed");
    expect(autoLineType("Delivered", "Waybill – Abuja")).toBe("Waybill");
    expect(autoLineType("Delivered", "Ada")).toBe("Delivered");
  });

  it("deducts fees, half of failed fees and other deductions", () => {
    const lines: RemitLine[] = [
      { customer: "A", product: "Shea", qty: 2, order_value: 17000, amount_charged: 5500, type: "Delivered" },
      { customer: "B", product: "Soap", qty: 3, order_value: 10500, amount_charged: 5000, type: "Delivered" },
      { customer: "Waybill", product: "Shea", qty: 4, order_value: 34000, amount_charged: 5000, type: "Waybill" },
      { customer: "C", product: "Soap", qty: 2, order_value: 7000, amount_charged: 5500, type: "Failed" },
    ];
    const s = remitSummary(lines, 1000);
    expect(s.received).toBe(61500);
    expect(s.units).toBe(9);
    expect(s.byProduct).toEqual({ Shea: 6, Soap: 3 });
    expect(s.deliveryFees).toBe(10500);
    expect(s.waybillFees).toBe(5000);
    expect(s.failedFees).toBe(2750);
    expect(s.expected).toBe(61500 - 10500 - 5000 - 2750 - 1000);
  });

  it("is zero with no lines", () => {
    expect(remitSummary([], 0).expected).toBe(0);
  });
});

describe("stock remaining", () => {
  it("lists stocked products and ones sold out today", () => {
    const products = [
      { name: "Shea", stock: 12 },
      { name: "Soap", stock: 0 },
      { name: "Oil", stock: 0 },
    ];
    expect(stockRemaining(products, ["soap"])).toEqual([
      { product: "Shea", stock: 12 },
      { product: "Soap", stock: 0 },
    ]);
  });
  it("is empty for merchants who keep no stock with us", () => {
    expect(stockRemaining([{ name: "Shea", stock: 0 }], ["Shea"])).toEqual([]);
    expect(stockRemaining([], [])).toEqual([]);
  });
});

describe("delivery report", () => {
  it("totals revenue overall and by rider", () => {
    const t = reportTotals([
      { order_value: 17000, rider_fee: 4500, amount_charged: charged(4500), rider_id: "r1", product: "Shea", qty: 2 },
      { order_value: 10500, rider_fee: 3000, amount_charged: charged(3000), rider_id: "r2", product: "Soap", qty: 3 },
      { order_value: 8500, rider_fee: 2500, amount_charged: charged(2500), rider_id: null, product: "Shea", qty: 1 },
    ]);
    expect(t.deliveries).toBe(3);
    expect(t.orderValue).toBe(36000);
    expect(t.riderFees).toBe(10000);
    expect(t.charged).toBe(6000 + 4500 + 4500);
    expect(t.revenue).toBe(1500 + 1500 + 2000);
    expect(t.units).toBe(6);
    expect(t.byProduct).toEqual({ Shea: 3, Soap: 3 });
    expect(t.byRider.r1).toEqual({ deliveries: 1, orderValue: 17000, charged: 6000, riderFees: 4500, revenue: 1500 });
    expect(t.byRider[""].revenue).toBe(2000);
  });
});

describe("matching", () => {
  const products = ["Shea body butter 250g", "Black soap bar", "Glow oil 100ml"];
  it("finds the closest product", () => {
    expect(matchProduct("2 pcs shea butter 250g", products)).toBe("Shea body butter 250g");
    expect(matchProduct("black soap", products)).toBe("Black soap bar");
    expect(matchProduct("glow oil 100ml", products)).toBe("Glow oil 100ml");
    expect(matchProduct("laptop", products)).toBe("");
    expect(matchProduct("", products)).toBe("");
  });
  it("looks up the rate card", () => {
    const rates = { Lekki: 4000, "Lekki Phase 1": 4500, Ikeja: 2500 };
    expect(lookupRate("ikeja", rates)).toEqual({ area: "Ikeja", fee: 2500 });
    expect(lookupRate("Lekki Phase 1, near Mega Plaza", rates)).toEqual({ area: "Lekki Phase 1", fee: 4500 });
    expect(lookupRate("Badagry", rates)).toBeNull();
    expect(lookupRate("", rates)).toBeNull();
  });
});

describe("dates and money", () => {
  it("formats", () => {
    expect(dmy("2026-10-27")).toBe("27/10/2026");
    expect(naira(22500)).toBe("₦22,500");
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
  });
  it("uses Lagos time for today", () => {
    // 23:30 UTC is already the next day in Lagos (UTC+1).
    expect(lagosToday(new Date("2026-10-27T23:30:00Z"))).toBe("2026-10-28");
  });
});
