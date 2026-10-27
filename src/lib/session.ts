import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import type { Merchant, Profile } from "./types";

export const MERCHANT_COOKIE = "meld_merchant";

export type Session = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  profile: Profile;
  merchants: Merchant[];
  merchant: Merchant | null;
};

/** The signed-in user, their profile and the merchants row-level security lets them see. Redirects if signed out. */
export const getSession = cache(async (): Promise<Session> => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) redirect("/signin");
  // Someone signed in with a temporary password set by an admin must choose their own first.
  if ((claims.claims.user_metadata as { must_change_password?: boolean } | undefined)?.must_change_password) {
    redirect("/auth/set-password");
  }

  const [{ data: profile }, { data: merchants }] = await Promise.all([
    supabase.from("profiles").select("id,name,email,title,role,all_merchants").eq("id", userId).single(),
    supabase.from("merchants").select("id,name,phone,email,pickup_address").order("name"),
  ]);
  if (!profile) redirect("/signin?error=no-profile");

  const list = (merchants ?? []) as Merchant[];
  const chosen = (await cookies()).get(MERCHANT_COOKIE)?.value;
  const merchant = list.find((m) => m.id === chosen) ?? list[0] ?? null;
  return { supabase, profile: profile as Profile, merchants: list, merchant };
});

/** For pages only admins may open. */
export async function requireAdmin(): Promise<Session> {
  const s = await getSession();
  if (s.profile.role !== "admin") redirect("/new");
  return s;
}

/** For server actions: returns the session, or throws instead of redirecting. */
export async function actionSession(opts: { admin?: boolean } = {}): Promise<Session> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) throw new Error("You’re signed out. Sign in again.");
  const s = await getSession();
  if (opts.admin && s.profile.role !== "admin") throw new Error("Only admins can do this.");
  return s;
}
