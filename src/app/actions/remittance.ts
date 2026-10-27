"use server";

import { revalidatePath } from "next/cache";
import { LINE_TYPES, autoLineType, toNum, type LineType } from "@/lib/calc";
import { actionSession } from "@/lib/session";

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

  const { data: orders, error: oErr } = await s.supabase
    .from("orders")
    .select("id,customer,product,qty,order_value,amount_charged,status")
    .eq("merchant_id", merchantId)
    .eq("delivery_date", date)
    .in("status", ["Delivered", "Failed", "Returned"])
    .order("created_at");
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

  const lines = cleanLines(
    id,
    (orders ?? []).map((o) => {
      const type = autoLineType(o.status, o.customer);
      return {
        order_id: o.id,
        customer: o.customer,
        // Quantity and value only count for lines that collected money.
        product: o.product,
        qty: type === "Failed" ? 0 : o.qty,
        order_value: type === "Failed" ? 0 : o.order_value,
        amount_charged: o.amount_charged,
        type,
      };
    }),
  );
  if (lines.length) {
    const { error } = await s.supabase.from("remittance_lines").insert(lines);
    if (error) return { ok: false, error: error.message };
  }
  revalidatePath("/remittance");
  return { ok: true };
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
  return { ok: true };
}

export async function setRemittanceStatus(id: string, status: "sent" | "paid"): Promise<Result> {
  const s = await actionSession({ admin: true });
  const { data: r } = await s.supabase.from("remittances").select("status").eq("id", id).single();
  if (!r) return { ok: false, error: "Remittance not found." };
  if (r.status === "paid") return { ok: false, error: "Already paid." };
  if (status === "sent" && r.status !== "draft") return { ok: true };

  const now = new Date().toISOString();
  const patch = status === "paid" ? { status, paid_at: now, paid_by: s.profile.id } : { status, sent_at: now };
  const { error } = await s.supabase.from("remittances").update(patch).eq("id", id);
  revalidatePath("/remittance");
  return error ? { ok: false, error: error.message } : { ok: true };
}
