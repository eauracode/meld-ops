"use server";

import { revalidatePath } from "next/cache";
import { charged, toNum } from "@/lib/calc";
import { actionSession } from "@/lib/session";

type Result = { ok: true } | { ok: false; error: string };
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

function refresh() {
  revalidatePath("/rider-pay");
  revalidatePath("/report");
  revalidatePath("/dashboard");
}

/**
 * Changes what the rider is paid for one order. The merchant's charge stays as it was (it is pinned
 * as a manual charge when the markup would otherwise move it), so only Meld's revenue changes.
 */
export async function setRiderFee(orderId: number, fee: number | string): Promise<Result> {
  const s = await actionSession({ admin: true });
  const rider_fee = Math.round(toNum(fee));
  if (rider_fee <= 0) return { ok: false, error: "Enter the rider’s pay." };

  const { data: o, error: rErr } = await s.supabase
    .from("orders")
    .select("rider_fee,amount_charged,charge_override,rider_payout_id")
    .eq("id", orderId)
    .single();
  if (rErr || !o) return { ok: false, error: rErr?.message ?? "Order not found." };
  if (o.rider_payout_id) return { ok: false, error: "This rider has already been paid for this order. Undo the payment first." };
  if (o.rider_fee === rider_fee) return { ok: true };

  const patch: { rider_fee: number; charge_override?: number | null } = { rider_fee };
  if (o.charge_override === null && charged(rider_fee) !== o.amount_charged) patch.charge_override = o.amount_charged;
  const { error } = await s.supabase.from("orders").update(patch).eq("id", orderId);
  refresh();
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Marks every unpaid delivered order for this rider between the dates as paid, as one payout. */
export async function payRider(riderId: string, from: string, to: string): Promise<{ ok: true; amount: number; orders: number } | { ok: false; error: string }> {
  const s = await actionSession({ admin: true });
  if (!isDate(from) || !isDate(to)) return { ok: false, error: "Pick the dates." };

  const { data: rows, error: oErr } = await s.supabase
    .from("orders")
    .select("id,rider_fee")
    .eq("rider_id", riderId)
    .eq("status", "Delivered")
    .is("rider_payout_id", null)
    .gte("delivery_date", from)
    .lte("delivery_date", to)
    .limit(1000);
  if (oErr) return { ok: false, error: oErr.message };
  if (!rows?.length) return { ok: false, error: "Nothing unpaid for this rider in these dates." };

  const amount = rows.reduce((n, r) => n + r.rider_fee, 0);
  const { data: payout, error: pErr } = await s.supabase
    .from("rider_payouts")
    .insert({ rider_id: riderId, amount, orders: rows.length, period_from: from, period_to: to })
    .select("id")
    .single();
  if (pErr || !payout) return { ok: false, error: pErr?.message ?? "Couldn’t record the payment." };

  const { error } = await s.supabase
    .from("orders")
    .update({ rider_payout_id: payout.id })
    .in("id", rows.map((r) => r.id));
  if (error) {
    await s.supabase.from("rider_payouts").delete().eq("id", payout.id);
    return { ok: false, error: error.message };
  }
  refresh();
  return { ok: true, amount, orders: rows.length };
}

/** Removes a payment; its orders go back to unpaid. */
export async function undoPayout(id: string): Promise<Result> {
  const s = await actionSession({ admin: true });
  const { error } = await s.supabase.from("rider_payouts").delete().eq("id", id);
  refresh();
  return error ? { ok: false, error: error.message } : { ok: true };
}
