import { describe, expect, it } from "vitest";
import { parseJson, toDraft } from "./extract";
import { lagosToday } from "./calc";

const products = ["Shea body butter 250g", "Black soap bar"];
const rates = { Ikeja: 2500, "Lekki Phase 1": 4500 };

describe("parseJson", () => {
  it("strips code fences and surrounding text", () => {
    expect(parseJson('```json\n{"qty":2}\n```')).toEqual({ qty: 2 });
    expect(parseJson('Here you go: {"qty":2} thanks')).toEqual({ qty: 2 });
  });
  it("rejects non-objects", () => {
    expect(() => parseJson("[1,2]")).toThrow();
    expect(() => parseJson("no json")).toThrow();
  });
});

describe("toDraft", () => {
  it("matches products and the rate card and fills the delivery cost", () => {
    const d = toDraft(
      {
        delivery_date: "2026-10-28",
        customer_name: "Adaeze Okonkwo",
        phone_number: "+234 803 456 7890",
        delivery_address: "7 Admiralty Road, Lekki Phase 1",
        area_zone: "Lekki phase 1",
        product_name: "shea butter 250g",
        qty: 2,
        order_value: "17,000",
        payment_method: null,
        notes: "Call before you arrive",
        uncertain_fields: [],
      },
      products,
      rates,
    );
    expect(d).toMatchObject({
      delivery_date: "2026-10-28",
      phone: "08034567890",
      area: "Lekki Phase 1",
      rider_fee: 4500,
      fee_from_rate_card: true,
      product: "Shea body butter 250g",
      qty: 2,
      order_value: 17000,
      payment: "Cash on delivery",
    });
    // The product name was matched, not copied, so it is flagged for a check.
    expect(d.uncertain).toEqual(["product"]);
  });

  it("flags missing fields and leaves an unknown area without a fee", () => {
    const d = toDraft({ customer_name: "Tobi", area_zone: "Badagry", payment_method: "Already paid", uncertain_fields: ["customer_name"] }, products, rates);
    expect(d.delivery_date).toBe(lagosToday());
    expect(d.area).toBe("");
    expect(d.rider_fee).toBe("");
    expect(d.payment).toBe("Already paid");
    expect(d.uncertain).toEqual(expect.arrayContaining(["customer", "phone", "address", "area", "product", "qty", "order_value"]));
  });
});
