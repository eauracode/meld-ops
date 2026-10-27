"use server";

import { revalidatePath } from "next/cache";
import { PAYMENTS, STATUSES, isValidPhone, normalisePhone, toNum, type OrderStatus, type Payment } from "@/lib/calc";
import { extractOrder, type ExtractResult } from "@/lib/extract";
import { actionSession } from "@/lib/session";
import { orderCode } from "@/lib/types";

async function merchantData(merchantId: string) {
  const s = await actionSession();
  if (!s.merchants.some((m) => m.id === merchantId)) throw new Error("You don’t have access to that merchant.");
  const [{ data: products }, { data: rates }] = await Promise.all([
    s.supabase.from("products").select("name").eq("merchant_id", merchantId),
    s.supabase.from("rates").select("area,rider_fee").eq("merchant_id", merchantId),
  ]);
  return {
    s,
    products: (products ?? []).map((p) => p.name as string),
    rates: Object.fromEntries((rates ?? []).map((r) => [r.area as string, r.rider_fee as number])),
  };
}

export async function extract(merchantId: string, message: string): Promise<ExtractResult> {
  const text = message.trim().slice(0, 4000);
  if (!text) return { ok: false, kind: "failed", message: "Paste a WhatsApp order message first." };
  const { products, rates } = await merchantData(merchantId);
  return extractOrder(text, products, rates);
}

export type OrderInput = {
  merchant_id: string;
  delivery_date: string;
  customer: string;
  phone: string;
  address: string;
  area: string;
  product: string;
  qty: number | string;
  order_value: number | string;
  rider_fee: number | string;
  payment: string;
  notes: string;
  rider_id: string;
  agent: string;
  pickup_station: string;
  contact_customer: boolean;
  status: string;
  raw_message: string;
};

export type SaveResult =
  | { ok: true; id: number; code: string }
  | { ok: false; error: string }
  | { ok: false; duplicate: { code: string; date: string; product: string; qty: number; status: string } };

export async function saveOrder(input: OrderInput, force = false): Promise<SaveResult> {
  const s = await actionSession();
  if (!s.merchants.some((m) => m.id === input.merchant_id)) return { ok: false, error: "You don’t have access to that merchant." };

  const row = {
    merchant_id: input.merchant_id,
    delivery_date: /^\d{4}-\d{2}-\d{2}$/.test(input.delivery_date) ? input.delivery_date : null,
    customer: input.customer.trim(),
    phone: normalisePhone(input.phone),
    address: input.address.trim(),
    area: input.area.trim(),
    product: input.product.trim(),
    qty: Math.max(1, Math.round(toNum(input.qty)) || 1),
    order_value: Math.round(toNum(input.order_value)),
    rider_fee: Math.round(toNum(input.rider_fee)),
    payment: (PAYMENTS as readonly string[]).includes(input.payment) ? (input.payment as Payment) : "Cash on delivery",
    notes: input.notes.trim(),
    rider_id: input.rider_id || null,
    agent: input.agent.trim(),
    pickup_station: input.pickup_station.trim(),
    contact_customer: Boolean(input.contact_customer),
    status: (STATUSES as readonly string[]).includes(input.status) ? (input.status as OrderStatus) : "Pending",
    raw_message: input.raw_message.slice(0, 4000),
  };

  const missing: string[] = [];
  if (!row.delivery_date) missing.push("delivery date");
  if (!row.customer) missing.push("customer name");
  if (!isValidPhone(row.phone)) missing.push("a valid phone number");
  if (!row.address) missing.push("delivery address");
  if (!row.product) missing.push("product");
  if (!row.rider_fee) missing.push("delivery cost");
  if (missing.length) return { ok: false, error: `Add ${missing.join(", ")} before saving.` };

  if (!force) {
    const { data: dup } = await s.supabase
      .from("orders")
      .select("id,delivery_date,product,qty,status")
      .eq("merchant_id", row.merchant_id)
      .ilike("customer", row.customer.replace(/[%_\\]/g, "\\$&"))
      .ilike("address", row.address.replace(/[%_\\]/g, "\\$&"))
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (dup) {
      return {
        ok: false,
        duplicate: { code: orderCode(dup.id), date: dup.delivery_date, product: dup.product, qty: dup.qty, status: dup.status },
      };
    }
  }

  const { data, error } = await s.supabase.from("orders").insert(row).select("id").single();
  if (error || !data) return { ok: false, error: `Couldn’t save the order. ${error?.message ?? ""}`.trim() };
  revalidatePath("/new");
  revalidatePath("/orders");
  return { ok: true, id: data.id, code: orderCode(data.id) };
}

export async function deleteOrder(id: number): Promise<{ ok: boolean; error?: string }> {
  const s = await actionSession();
  const { error } = await s.supabase.from("orders").delete().eq("id", id);
  revalidatePath("/new");
  revalidatePath("/orders");
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function updateOrder(
  id: number,
  patch: { status?: string; rider_id?: string | null },
): Promise<{ ok: boolean; error?: string }> {
  const s = await actionSession();
  const update: { status?: OrderStatus; rider_id?: string | null } = {};
  if (patch.status !== undefined) {
    if (!(STATUSES as readonly string[]).includes(patch.status)) return { ok: false, error: "Unknown status." };
    update.status = patch.status as OrderStatus;
  }
  if (patch.rider_id !== undefined) update.rider_id = patch.rider_id || null;
  const { error } = await s.supabase.from("orders").update(update).eq("id", id);
  revalidatePath("/orders");
  revalidatePath("/new");
  revalidatePath("/report");
  return error ? { ok: false, error: error.message } : { ok: true };
}
