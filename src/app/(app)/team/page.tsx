import { requireAdmin } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/server";
import { mailConfigured } from "@/lib/mail";
import { Team, type Member } from "./team";

export const metadata = { title: "Team and access · Meld Ops" };

export default async function TeamPage() {
  const { supabase, profile, merchants } = await requireAdmin();
  const [{ data: people }, { data: access }] = await Promise.all([
    supabase.from("profiles").select("id,name,email,title,role,all_merchants").order("name"),
    supabase.from("merchant_access").select("user_id,merchant_id"),
  ]);

  // Who has accepted their invite comes from auth, which only the secret key can read.
  const confirmed = new Set<string>();
  try {
    const { data } = await createAdminClient().auth.admin.listUsers({ perPage: 1000 });
    for (const u of data.users) if (u.last_sign_in_at || u.email_confirmed_at) confirmed.add(u.id);
  } catch {
    for (const p of people ?? []) confirmed.add(p.id);
  }

  const members: Member[] = (people ?? []).map((p) => ({
    ...p,
    merchants: p.role === "admin" || p.all_merchants ? "all" : (access ?? []).filter((a) => a.user_id === p.id).map((a) => a.merchant_id as string),
    status: confirmed.has(p.id) ? "active" : "invited",
  }));

  return <Team members={members} merchants={merchants} selfId={profile.id} canEmail={mailConfigured()} />;
}
