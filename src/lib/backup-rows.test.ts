import { describe, expect, it } from "vitest";
import { buildTabs, lagosTime, type BackupData } from "./backup-rows";
import { jwtClaims } from "./google-sheets";

const empty: BackupData = {
  orders: [],
  merchants: [],
  products: [],
  rates: [],
  riders: [],
  remittances: [],
  remittanceLines: [],
  riderPayouts: [],
  stations: [],
  stationStock: [],
  stockMoves: [],
  profiles: [],
};

const data: BackupData = {
  ...empty,
  merchants: [{ id: "m1", name: "Explaura", phone: "", email: "", pickup_address: "Yaba", default_station_id: "s1" }],
  riders: [{ id: "r1", name: "Musa", phone: "", active: true }],
  stations: [
    { id: "s1", name: "Main station", address: "", active: true },
    { id: "s2", name: "Ikeja hub", address: "", active: true },
  ],
  products: [{ id: "p1", merchant_id: "m1", name: "Pill Organizer", price: 23500, stock: 6 }],
  stationStock: [
    { product_id: "p1", station_id: "s1", qty: 4 },
    { product_id: "p1", station_id: "s2", qty: 2 },
  ],
  orders: [
    {
      id: 1004,
      merchant_id: "m1",
      delivery_date: "2026-10-29",
      customer: "Rashidat Folake",
      product: "Pill Organizer",
      qty: 1,
      order_value: 23500,
      rider_fee: 4000,
      amount_charged: 5500,
      status: "Delivered",
      rider_id: "r1",
      station_id: "s1",
      rider_payout_id: "x",
      created_at: "2026-10-29T10:47:33Z",
    },
  ],
  remittances: [{ id: "rm1", merchant_id: "m1", remit_date: "2026-10-29", status: "draft", other_deductions: 500, other_note: "Packaging" }],
  remittanceLines: [
    { remittance_id: "rm1", order_id: 1004, position: 0, customer: "Rashidat Folake", product: "Pill Organizer", qty: 1, order_value: 23500, amount_charged: 5500, type: "Delivered" },
    { remittance_id: "rm1", order_id: null, position: 1, customer: "Ade", product: "Pill Organizer", qty: 0, order_value: 0, amount_charged: 6000, type: "Failed" },
  ],
};

const tab = (name: string) => buildTabs(data, new Date("2026-10-30T23:05:00Z")).find((t) => t.name === name)!;

describe("backup tabs", () => {
  it("writes orders with names, codes and revenue", () => {
    const t = tab("Orders");
    const h = t.rows[0];
    const row = t.rows[1];
    const col = (name: string) => row[h.indexOf(name)];
    expect(t.rows).toHaveLength(2);
    expect(col("Order")).toBe("MLD-1004");
    expect(col("Delivery date")).toBe("29/10/2026");
    expect(col("Merchant")).toBe("Explaura");
    expect(col("Station")).toBe("Main station");
    expect(col("Rider")).toBe("Musa");
    expect(col("Revenue")).toBe(1500);
    expect(col("Rider paid")).toBe("Yes");
    expect(col("Created")).toBe("29/10/2026 11:47");
  });

  it("totals remittances with the remittance rules", () => {
    const row = tab("Remittances").rows[1];
    // received 23,500 − delivery 5,500 − failed 3,000 (50% of 6,000) − other 500
    expect(row.slice(3, 10)).toEqual([23500, 5500, 0, 3000, 500, "Packaging", 14500]);
  });

  it("puts stock in a column per station plus the total", () => {
    const t = tab("Stock");
    expect(t.rows[0]).toEqual(["Merchant", "Product", "Price", "Main station", "Ikeja hub", "Total"]);
    expect(t.rows[1]).toEqual(["Explaura", "Pill Organizer", 23500, 4, 2, 6]);
  });

  it("lists row counts on the About tab and works with no data", () => {
    const about = buildTabs(empty).find((t) => t.name === "About")!;
    expect(about.rows.find((r) => r[0] === "Orders")).toEqual(["Orders", 0]);
    expect(buildTabs(empty)).toHaveLength(11);
  });

  it("formats times in Lagos", () => {
    expect(lagosTime("2026-10-30T23:05:00Z")).toBe("31/10/2026 00:05");
    expect(lagosTime(null)).toBe("");
  });

  it("asks Google for a one-hour Sheets token", () => {
    expect(jwtClaims("sa@x.iam.gserviceaccount.com", 1000)).toEqual({
      iss: "sa@x.iam.gserviceaccount.com",
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token",
      iat: 1000,
      exp: 4600,
    });
  });
});
