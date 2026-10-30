import "server-only";
import type { Session } from "@/lib/session";
import type { Station } from "@/lib/types";

/** All stations, or null when migration 005 hasn't been run yet (pages then hide station features). */
export async function loadStations(supabase: Session["supabase"]): Promise<Station[] | null> {
  const { data, error } = await supabase.from("stations").select("id,name,address,active").order("created_at");
  return error ? null : ((data ?? []) as Station[]);
}

/** The merchant's default station id, or null (none set, or before migration 005). */
export async function defaultStation(supabase: Session["supabase"], merchantId: string): Promise<string | null> {
  const { data, error } = await supabase.from("merchants").select("default_station_id").eq("id", merchantId).maybeSingle();
  return error ? null : ((data?.default_station_id as string | null) ?? null);
}
