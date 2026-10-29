"use server";

import { revalidatePath } from "next/cache";
import { LINE_TYPES, charged, stockRemaining, toNum, type LineType } from "@/lib/calc";
import { finishedOrders, orderToLine } from "@/lib/remit-lines";
import { actionSession, type Session } from "@/lib/session";

type Result = { ok: true } | { ok: false; error: string };

export type LineInput = {
  order_id: number | null;
  customer: string;
  product: string;
  qty: number | string;
  order_value: number | string;
  amount_charged: number | string;
  type: string;
};

function cleanLines(remittanceId: string, lines: LineInput[]) {
  return lines.slice(0, 500).map((l, i) => ({
    remittance_id: remittanceId,
    order_id: l.order_id ?? null,
    position: i,
    customer: String(l.customer ?? "").slice(0, 200),
    product: String(l.product ?? "").slice(0, 200),
    qty: Math.max(0, Math.round(toNum(l.qty))),
    order_value: Math.max(0, Math.round(toNum(l.order_value))),
    amount_charged: Math.max(0, Math.round(toNum(l.amount_charged))),
    type: ((LINE_TYPES as readonly string[]).includes(l.type) ? l.type : "Delivered") as LineType,
  }));
}

/** Creates (or rebuilds) the remittance for one merchant and day from its finished orders. */
export async function generateRemittance(merchantId: string, date: string): Promise<Result> {
  const s = await actionSession({ admin: true });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "Pick a date." };

  const { data: existing } = await s.supabase
    .from("remittances")
    .select("id,status")
    .eq("merchant_id", merchantId)
    .eq("remit_date", date)
    .maybeSingle();
  if (existing?.status === "paid") return { ok: false, error: "This remittance is paid and locked." };

  const { data: orders, error: oErr } = await finishedOrders(s.supabase, merchantId, date);
  if (oErr) return { ok: false, error: oErr.message };

  let id = existing?.id as string | undefined;
  if (id) {
    const { error } = await s.supabase
      .from("remittances")
      .update({ other_deductions: 0, other_note: "", generated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return { ok: false, error: error.message };
    await s.supabase.from("remittance_lines").delete().eq("remittance_id", id);
  } else {
    const { data, error } = await s.supabase.from("remittances").insert({ merchant_id: merchantId, remit_date: date }).select("id").single();
    if (error || !data) return { ok: false, error: error?.message ?? "Couldn’t create the remittance." };
    id = data.id as string;
  }

  const lines = (orders ?? []).map((o, i) => orderToLine(id!, o, i));
  if (lines.length) {
    const { error } = await s.supabase.from("remittance_lines").insert(lines);
    if (error) return { ok: false, error: error.message };
  }
  revalidatePath("/remittance");
  return { ok: true };
}

/**
 * An amount charged edited on a remittance line becomes that order's charge, so the dashboard and
 * delivery report agree with the remittance. Matching the markup again clears the manual charge.
 * Best effort: before migration 003 there is no charge_override column and nothing changes.
 */
async function syncOrderCharges(supabase: Session["supabase"], rows: { order_id: number | null; amount_charged: number }[]) {
  const linked = rows.filter((r) => r.order_id !== null);
  if (!linked.length) return;
  const { data: orders } = await supabase
    .from("orders")
    .select("id,rider_fee,amount_charged")
    .in("id", linked.map((r) => r.order_id!));
  for (const o of orders ?? []) {
    const want = linked.find((r) => r.order_id === o.id)!.amount_charged;
    if (want === o.amount_charged) continue;
    const { error } = await supabase
      .from("orders")
      .update({ charge_override: want === charged(o.rider_fee) ? null : want })
      .eq("id", o.id);
    if (error) return; // column not there yet
  }
  revalidatePath("/dashboard");
  revalidatePath("/report");
  revalidatePath("/orders");
}

/** Saves the edited lines and other deductions. Called as the admin types (debounced). */
export async function saveRemittance(id: string, lines: LineInput[], other: number | string, otherNote: string): Promise<Result> {
  const s = await actionSession({ admin: true });
  const { data: r } = await s.supabase.from("remittances").select("status").eq("id", id).single();
  if (!r) return { ok: false, error: "Remittance not found." };
  if (r.status === "paid") return { ok: false, error: "This remittance is paid and locked." };

  const { error: uErr } = await s.supabase
    .from("remittances")
    .update({ other_deductions: Math.max(0, Math.round(toNum(other))), other_note: String(otherNote ?? "").slice(0, 200) })
    .eq("id", id);
  if (uErr) return { ok: false, error: uErr.message };

  const { error: dErr } = await s.supabase.from("remittance_lines").delete().eq("remittance_id", id);
  if (dErr) return { ok: false, error: dErr.message };
  const rows = cleanLines(id, lines);
  if (rows.length) {
    const { error } = await s.supabase.from("remittance_lines").insert(rows);
    if (error) return { ok: false, error: error.message };
  }
  await syncOrderCharges(s.supabase, rows);
  return { ok: true };
}

export async function setRemittanceStatus(id: string, status: "sent" | "paid"): Promise<Result> {
  const s = await actionSession({ admin: true });
  // select("*") so this still works before migration 002 adds stock_snapshot.
  const { data: r } = await s.supabase.from("remittances").select("*").eq("id", id).single();
  if (!r) return { ok: false, error: "Remittance not found." };
  if (r.status === "paid") return { ok: false, error: "Already paid." };
  if (status === "sent" && r.status !== "draft") return { ok: true };

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = status === "paid" ? { status, paid_at: now, paid_by: s.profile.id } : { status, sent_at: now };

  // Freeze the stock the merchant holds as the report leaves our hands (first of sent/paid).
  if (!r.stock_snapshot) {
    const [{ data: products }, { data: lines }] = await Promise.all([
      s.supabase.from("products").select("name,stock").eq("merchant_id", r.merchant_id),
      s.supabase.from("remittance_lines").select("product").eq("remittance_id", id),
    ]);
    patch.stock_snapshot = stockRemaining(products ?? [], (lines ?? []).map((l) => l.product));
  }

  let { error } = await s.supabase.from("remittances").update(patch).eq("id", id);
  if (error && "stock_snapshot" in patch && /stock_snapshot/.test(error.message)) {
    // Column not added yet (migration 002): save the status without the snapshot.
    delete patch.stock_snapshot;
    ({ error } = await s.supabase.from("remittances").update(patch).eq("id", id));
  }
  revalidatePath("/remittance");
  return error ? { ok: false, error: error.message } : { ok: true };
}
