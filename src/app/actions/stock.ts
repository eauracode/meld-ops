"use server";

import { revalidatePath } from "next/cache";
import { toNum } from "@/lib/calc";
import { actionSession } from "@/lib/session";

type Result = { ok: true } | { ok: false; error: string };

const fail = (error: { message: string } | null): Result => (error ? { ok: false, error: error.message } : { ok: true });

function refresh() {
  revalidatePath("/merchants");
  revalidatePath("/stations");
  revalidatePath("/remittance");
}

const count = (v: number | string) => Math.round(toNum(v));

// ---------- stock (each is one logged database transaction; see migration 005) ----------
export async function addStock(productId: string, stationId: string, qty: number | string, note: string): Promise<Result> {
  const s = await actionSession({ admin: true });
  const { error } = await s.supabase.rpc("stock_add", { p_product: productId, p_station: stationId, p_qty: count(qty), p_note: note.trim().slice(0, 200) });
  if (!error) {
    // A merchant's first stock with us: deliveries take from this station from now on.
    const { data: p } = await s.supabase.from("products").select("merchant_id").eq("id", productId).single();
    if (p) await s.supabase.from("merchants").update({ default_station_id: stationId }).eq("id", p.merchant_id).is("default_station_id", null);
  }
  refresh();
  revalidatePath("/new");
  return fail(error);
}

export async function moveStock(productId: string, from: string, to: string, qty: number | string, note: string): Promise<Result> {
  const s = await actionSession({ admin: true });
  const { error } = await s.supabase.rpc("stock_move", { p_product: productId, p_from: from, p_to: to, p_qty: count(qty), p_note: note.trim().slice(0, 200) });
  refresh();
  return fail(error);
}

export async function countStock(productId: string, stationId: string, counted: number | string, note: string): Promise<Result> {
  const s = await actionSession({ admin: true });
  if (String(counted).trim() === "") return { ok: false, error: "Enter the number counted." };
  const { error } = await s.supabase.rpc("stock_set", { p_product: productId, p_station: stationId, p_count: count(counted), p_note: note.trim().slice(0, 200) });
  refresh();
  return fail(error);
}

// ---------- stations ----------
export async function addStation(name: string, address: string): Promise<Result> {
  const s = await actionSession({ admin: true });
  if (!name.trim()) return { ok: false, error: "Enter the station’s name." };
  const { error } = await s.supabase.from("stations").insert({ name: name.trim().slice(0, 80), address: address.trim().slice(0, 200) });
  refresh();
  if (error?.code === "23505") return { ok: false, error: `There’s already a station called ${name.trim()}.` };
  return fail(error);
}

export async function saveStation(id: string, v: { name: string; address: string; active: boolean }): Promise<Result> {
  const s = await actionSession({ admin: true });
  if (!v.name.trim()) return { ok: false, error: "Enter the station’s name." };
  const { error } = await s.supabase
    .from("stations")
    .update({ name: v.name.trim().slice(0, 80), address: v.address.trim().slice(0, 200), active: v.active })
    .eq("id", id);
  refresh();
  if (error?.code === "23505") return { ok: false, error: `There’s already a station called ${v.name.trim()}.` };
  return fail(error);
}

export async function setDefaultStation(merchantId: string, stationId: string | null): Promise<Result> {
  const s = await actionSession({ admin: true });
  const { error } = await s.supabase.from("merchants").update({ default_station_id: stationId || null }).eq("id", merchantId);
  refresh();
  revalidatePath("/new");
  return fail(error);
}
