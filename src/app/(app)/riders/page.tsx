import { getSession } from "@/lib/session";
import { lagosToday } from "@/lib/calc";
import { Riders } from "./riders";
import type { Rider } from "@/lib/types";

export const metadata = { title: "Riders · Meld Ops" };

export default async function RidersPage() {
  const { supabase } = await getSession();
  const today = lagosToday();
  const [{ data: riders }, { data: orders }] = await Promise.all([
    supabase.from("riders").select("id,name,phone,active").order("name"),
    // Only orders for merchants this person can see are counted (row-level security).
    supabase.from("orders").select("rider_id,status").eq("delivery_date", today).not("rider_id", "is", null),
  ]);
  const counts: Record<string, { total: number; delivered: number }> = {};
  for (const o of orders ?? []) {
    const c = (counts[o.rider_id as string] ??= { total: 0, delivered: 0 });
    c.total++;
    if (o.status === "Delivered") c.delivered++;
  }
  return <Riders riders={(riders ?? []) as Rider[]} counts={counts} />;
}
