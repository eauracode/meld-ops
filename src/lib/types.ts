import type { LineType, OrderStatus, Payment, StockRow } from "./calc";

export type Role = "ops" | "admin";

export type Profile = {
  id: string;
  name: string;
  email: string;
  title: string;
  role: Role;
  all_merchants: boolean;
};

export type Merchant = {
  id: string;
  name: string;
  phone: string;
  email: string;
  pickup_address: string;
};

export type Product = { id: string; merchant_id: string; name: string; price: number; stock: number };
export type Rate = { merchant_id: string; area: string; rider_fee: number };
export type Rider = { id: string; name: string; phone: string; active: boolean };

export type Order = {
  id: number;
  merchant_id: string;
  delivery_date: string;
  customer: string;
  phone: string;
  address: string;
  area: string;
  product: string;
  qty: number;
  order_value: number;
  rider_fee: number;
  amount_charged: number;
  payment: Payment;
  notes: string;
  rider_id: string | null;
  agent: string;
  pickup_station: string;
  contact_customer: boolean;
  status: OrderStatus;
  created_at: string;
};

export type Remittance = {
  id: string;
  merchant_id: string;
  remit_date: string;
  status: "draft" | "sent" | "paid";
  other_deductions: number;
  other_note: string;
  /** Missing until migration 002 is run. */
  stock_snapshot?: StockRow[] | null;
};

export type RemittanceLine = {
  id: string;
  order_id: number | null;
  position: number;
  customer: string;
  product: string;
  qty: number;
  order_value: number;
  amount_charged: number;
  type: LineType;
};

export const orderCode = (id: number) => `MLD-${id}`;

export const roleLabel = (r: Role) => (r === "admin" ? "Admin / finance" : "Ops / dispatcher");
