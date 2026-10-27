"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { MERCHANT_COOKIE, actionSession } from "@/lib/session";

export async function setMerchant(merchantId: string) {
  const { merchants } = await actionSession();
  if (!merchants.some((m) => m.id === merchantId)) throw new Error("You don’t have access to that merchant.");
  (await cookies()).set(MERCHANT_COOKIE, merchantId, { path: "/", sameSite: "lax", httpOnly: true, maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/signin");
}
