"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { isValidPhone, normalisePhone, toNum } from "@/lib/calc";
import { MERCHANT_COOKIE, actionSession } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/types";

type Result = { ok: true } | { ok: false; error: string };
const fail = (e: { message: string } | null): Result => (e ? { ok: false, error: e.message } : { ok: true });

// The standard Lagos rate card new merchants start with; edit per merchant afterwards.
const BASE_RATES: Record<string, number> = {
  Ikeja: 2500, Maryland: 2500, Oshodi: 2500, Gbagada: 2800, Yaba: 3000, Surulere: 3000, Ojota: 3000,
  "Victoria Island": 4000, Ikoyi: 4000, Festac: 4000, "Lekki Phase 1": 4500, Ikorodu: 5000, Ajah: 5500, Sangotedo: 6000,
};

// ---------- merchants ----------
export async function addMerchant(name: string, pickup: string): Promise<Result> {
  const s = await actionSession({ admin: true });
  if (!name.trim()) return { ok: false, error: "Enter the business name." };
  const { data, error } = await s.supabase
    .from("merchants")
    .insert({ name: name.trim(), pickup_address: pickup.trim() })
    .select("id")
    .single();
  if (error || !data) return fail(error);
  await s.supabase.from("rates").insert(Object.entries(BASE_RATES).map(([area, rider_fee]) => ({ merchant_id: data.id, area, rider_fee })));
  (await cookies()).set(MERCHANT_COOKIE, data.id, { path: "/", sameSite: "lax", httpOnly: true, maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function saveMerchant(id: string, v: { name: string; phone: string; email: string; pickup_address: string }): Promise<Result> {
  const s = await actionSession({ admin: true });
  if (!v.name.trim()) return { ok: false, error: "Business name can’t be empty." };
  const phone = v.phone.trim() ? normalisePhone(v.phone) : "";
  if (phone && !isValidPhone(phone)) return { ok: false, error: "Use an 11-digit WhatsApp number starting 070, 080, 081, 090 or 091." };
  const { error } = await s.supabase
    .from("merchants")
    .update({ name: v.name.trim(), phone, email: v.email.trim(), pickup_address: v.pickup_address.trim() })
    .eq("id", id);
  revalidatePath("/", "layout");
  return fail(error);
}

// ---------- products ----------
export async function upsertProduct(p: { id?: string; merchant_id: string; name: string; price: number | string; stock: number | string }): Promise<Result & { id?: string }> {
  const s = await actionSession({ admin: true });
  const row = { merchant_id: p.merchant_id, name: p.name.trim(), price: Math.max(0, Math.round(toNum(p.price))), stock: Math.round(toNum(p.stock)) };
  if (!row.name) return { ok: false, error: "Enter a product name." };
  const q = p.id
    ? s.supabase.from("products").update(row).eq("id", p.id).select("id").single()
    : s.supabase.from("products").insert(row).select("id").single();
  const { data, error } = await q;
  if (error) return { ok: false, error: error.code === "23505" ? `${row.name} is already a product.` : error.message };
  revalidatePath("/merchants");
  return { ok: true, id: data.id };
}

export async function deleteProduct(id: string): Promise<Result> {
  const s = await actionSession({ admin: true });
  const { error } = await s.supabase.from("products").delete().eq("id", id);
  revalidatePath("/merchants");
  return fail(error);
}

// ---------- rate card ----------
export async function setRate(merchantId: string, area: string, fee: number | string): Promise<Result> {
  const s = await actionSession({ admin: true });
  const rider_fee = Math.round(toNum(fee));
  if (!area.trim() || rider_fee <= 0) return { ok: false, error: "Enter an area and its rider fee." };
  const { error } = await s.supabase.from("rates").upsert({ merchant_id: merchantId, area: area.trim(), rider_fee });
  revalidatePath("/merchants");
  return fail(error);
}

export async function deleteRate(merchantId: string, area: string): Promise<Result> {
  const s = await actionSession({ admin: true });
  const { error } = await s.supabase.from("rates").delete().eq("merchant_id", merchantId).eq("area", area);
  revalidatePath("/merchants");
  return fail(error);
}

// ---------- riders ----------
export async function addRider(name: string, phone: string): Promise<Result> {
  const s = await actionSession();
  const p = normalisePhone(phone);
  if (!name.trim()) return { ok: false, error: "Enter the rider’s name." };
  if (!isValidPhone(p)) return { ok: false, error: "Use an 11-digit number starting 070, 080, 081, 090 or 091." };
  const { error } = await s.supabase.from("riders").insert({ name: name.trim(), phone: p });
  revalidatePath("/riders");
  return fail(error);
}

export async function setRiderActive(id: string, active: boolean): Promise<Result> {
  const s = await actionSession();
  const { error } = await s.supabase.from("riders").update({ active }).eq("id", id);
  revalidatePath("/riders");
  return fail(error);
}

// ---------- team ----------
const MIN_PASSWORD = 8;

/**
 * Adds a team member. With a temporary password the account works straight away and they must
 * choose their own password at first sign-in; without one, Supabase emails them an invite link.
 */
export async function inviteMember(v: {
  name: string;
  email: string;
  title: string;
  role: Role;
  merchants: "all" | string[];
  tempPassword?: string;
}): Promise<Result> {
  await actionSession({ admin: true });
  const email = v.email.trim().toLowerCase();
  if (!v.name.trim()) return { ok: false, error: "Enter their full name." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: "Enter a valid email address." };
  const role: Role = v.role === "admin" ? "admin" : "ops";
  const all = role === "admin" || v.merchants === "all";
  if (!all && !v.merchants.length) return { ok: false, error: "Give them at least one merchant." };
  const password = v.tempPassword?.trim();
  if (password !== undefined && password.length < MIN_PASSWORD) return { ok: false, error: `The temporary password needs at least ${MIN_PASSWORD} characters.` };

  const admin = createAdminClient();
  const meta = { name: v.name.trim(), title: v.title, role, all_merchants: all };
  const { data, error } = password
    ? await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { ...meta, must_change_password: true } })
    : await admin.auth.admin.inviteUserByEmail(email, { data: meta, redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/auth/set-password` });
  if (error) return { ok: false, error: /already/i.test(error.message) ? "Someone on the team already uses this email." : error.message };
  if (!all && data.user) {
    const { error: aErr } = await admin.from("merchant_access").insert((v.merchants as string[]).map((merchant_id) => ({ user_id: data.user!.id, merchant_id })));
    if (aErr) return fail(aErr);
  }
  revalidatePath("/team");
  return { ok: true };
}

export async function resendInvite(email: string): Promise<Result> {
  await actionSession({ admin: true });
  const { error } = await createAdminClient().auth.admin.inviteUserByEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/auth/set-password`,
  });
  return fail(error);
}

/** Gives someone a new temporary password; they must replace it at their next sign-in. */
export async function setTempPassword(userId: string, password: string): Promise<Result> {
  const s = await actionSession({ admin: true });
  if (userId === s.profile.id) return { ok: false, error: "Change your own password from the sign-in page with “Forgot password?”." };
  if (password.trim().length < MIN_PASSWORD) return { ok: false, error: `Use at least ${MIN_PASSWORD} characters.` };
  const { error } = await createAdminClient().auth.admin.updateUserById(userId, {
    password: password.trim(),
    email_confirm: true,
    user_metadata: { must_change_password: true },
  });
  revalidatePath("/team");
  return fail(error);
}

async function adminCount(s: Awaited<ReturnType<typeof actionSession>>) {
  const { count } = await s.supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin");
  return count ?? 0;
}

export async function setMemberRole(userId: string, role: Role): Promise<Result> {
  const s = await actionSession({ admin: true });
  if (userId === s.profile.id) return { ok: false, error: "You can’t change your own role." };
  const patch = role === "admin" ? { role, all_merchants: true } : { role: "ops" as Role };
  const { error } = await s.supabase.from("profiles").update(patch).eq("id", userId);
  revalidatePath("/team");
  return fail(error);
}

export async function setMemberAccess(userId: string, merchants: "all" | string[]): Promise<Result> {
  const s = await actionSession({ admin: true });
  if (merchants !== "all" && !merchants.length) return { ok: false, error: "Give them at least one merchant, or remove them from the team." };
  const { error } = await s.supabase.from("profiles").update({ all_merchants: merchants === "all" }).eq("id", userId);
  if (error) return fail(error);
  await s.supabase.from("merchant_access").delete().eq("user_id", userId);
  if (merchants !== "all") {
    const { error: aErr } = await s.supabase.from("merchant_access").insert(merchants.map((merchant_id) => ({ user_id: userId, merchant_id })));
    if (aErr) return fail(aErr);
  }
  revalidatePath("/team");
  return { ok: true };
}

export async function removeMember(userId: string): Promise<Result> {
  const s = await actionSession({ admin: true });
  if (userId === s.profile.id) return { ok: false, error: "You can’t remove yourself." };
  const { data: target } = await s.supabase.from("profiles").select("role").eq("id", userId).single();
  if (target?.role === "admin" && (await adminCount(s)) < 2) return { ok: false, error: "Keep at least one admin." };
  const { error } = await createAdminClient().auth.admin.deleteUser(userId);
  revalidatePath("/team");
  return fail(error);
}
