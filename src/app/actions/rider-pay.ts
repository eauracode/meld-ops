"use server";

import { revalidatePath } from "next/cache";
import { charged, lagosToday, toNum } from "@/lib/calc";
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
    .select("rider_fee,amount_charged,charge_override,rider_payout_id,inhouse")
    .eq("id", orderId)
    .single();
  if (rErr || !o) return { ok: false, error: rErr?.message ?? "Order not found." };
  if (o.inhouse) return { ok: false, error: "In-house riders are salaried; there’s no per-delivery pay to edit." };
  if (o.rider_payout_id) return { ok: false, error: "This rider has already been paid for this order. Undo the payment first." };
  if (o.rider_fee === rider_fee) return { ok: true };

  const patch: { rider_fee: number; charge_override?: number | null } = { rider_fee };
  if (o.charge_override === null && charged(rider_fee) !== o.amount_charged) patch.charge_override = o.amount_charged;
  const { error } = await s.supabase.from("orders").update(patch).eq("id", orderId);
  refresh();
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Marks every unpaid trip (delivered, failed or returned) for this rider between the dates as paid, as one payout. */
export async function payRider(riderId: string, from: string, to: string): Promise<{ ok: true; amount: number; orders: number } | { ok: false; error: string }> {
  const s = await actionSession({ admin: true });
  if (!isDate(from) || !isDate(to)) return { ok: false, error: "Pick the dates." };

  const { data: rows, error: oErr } = await s.supabase
    .from("orders")
    .select("id,rider_fee")
    .eq("rider_id", riderId)
    .in("status", ["Delivered", "Failed", "Returned"]) // failed trips are paid too
    .eq("inhouse", false) // in-house riders are salaried, never paid per delivery
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

/**
 * Marks one trip paid as its own payout, on the day the rider was actually paid (Lagos date), so a
 * past payment shows in the records with its real date.
 */
export async function payOrder(orderId: number, paidOn: string): Promise<{ ok: true; amount: number } | { ok: false; error: string }> {
  const s = await actionSession({ admin: true });
  if (!isDate(paidOn)) return { ok: false, error: "Pick the date the rider was paid." };
  if (paidOn > lagosToday()) return { ok: false, error: "The payment date can’t be in the future." };

  const { data: o, error: oErr } = await s.supabase
    .from("orders")
    .select("id,rider_id,rider_fee,status,inhouse,rider_payout_id,delivery_date")
    .eq("id", orderId)
    .single();
  if (oErr || !o) return { ok: false, error: oErr?.message ?? "Order not found." };
  if (!o.rider_id) return { ok: false, error: "Assign the rider first." };
  if (o.inhouse) return { ok: false, error: "In-house riders are salaried; there’s no per-delivery pay to record." };
  if (!["Delivered", "Failed", "Returned"].includes(o.status)) return { ok: false, error: "Only delivered, failed or returned trips are paid." };
  if (o.rider_payout_id) return { ok: false, error: "This trip is already marked paid." };

  const { data: payout, error: pErr } = await s.supabase
    .from("rider_payouts")
    .insert({
      rider_id: o.rider_id,
      amount: o.rider_fee,
      orders: 1,
      period_from: o.delivery_date,
      period_to: o.delivery_date,
      paid_at: `${paidOn}T12:00:00+01:00`,
    })
    .select("id")
    .single();
  if (pErr || !payout) return { ok: false, error: pErr?.message ?? "Couldn’t record the payment." };

  const { data: done, error } = await s.supabase
    .from("orders")
    .update({ rider_payout_id: payout.id })
    .eq("id", orderId)
    .is("rider_payout_id", null)
    .select("id");
  if (error || !done?.length) {
    await s.supabase.from("rider_payouts").delete().eq("id", payout.id);
    return { ok: false, error: error?.message ?? "This trip is already marked paid." };
  }
  refresh();
  return { ok: true, amount: o.rider_fee };
}

/** Removes a payment; its orders go back to unpaid. */
export async function undoPayout(id: string): Promise<Result> {
  const s = await actionSession({ admin: true });
  const { error } = await s.supabase.from("rider_payouts").delete().eq("id", id);
  refresh();
  return error ? { ok: false, error: error.message } : { ok: true };
}
