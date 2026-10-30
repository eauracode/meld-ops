import { getSession } from "@/lib/session";
import { lagosToday } from "@/lib/calc";
import { defaultStation, loadStations } from "@/lib/stations";
import { NoMerchant } from "@/components/no-merchant";
import { NewOrder } from "./new-order";
import type { Order, Product, Rider } from "@/lib/types";

export const metadata = { title: "New order · Meld Ops" };

export default async function NewOrderPage() {
  const { supabase, merchant, profile } = await getSession();
  if (!merchant) return <NoMerchant title="New order" admin={profile.role === "admin"} />;

  const today = lagosToday();
  const [{ data: products }, { data: rates }, { data: riders }, { data: todays }, stations, defaultStationId] = await Promise.all([
    supabase.from("products").select("id,merchant_id,name,price,stock").eq("merchant_id", merchant.id).order("name"),
    supabase.from("rates").select("area,rider_fee").eq("merchant_id", merchant.id).order("area"),
    supabase.from("riders").select("id,name,phone,active").eq("active", true).order("name"),
    supabase
      .from("orders")
      .select("id,customer,area,product,qty,order_value,status")
      .eq("merchant_id", merchant.id)
      .eq("delivery_date", today)
      .order("created_at", { ascending: false }),
    loadStations(supabase),
    defaultStation(supabase, merchant.id),
  ]);

  return (
    <NewOrder
      key={merchant.id}
      merchant={merchant}
      today={today}
      products={(products ?? []) as Product[]}
      rates={Object.fromEntries((rates ?? []).map((r) => [r.area, r.rider_fee]))}
      riders={(riders ?? []) as Rider[]}
      todays={(todays ?? []) as Pick<Order, "id" | "customer" | "area" | "product" | "qty" | "order_value" | "status">[]}
      stations={stations}
      defaultStationId={defaultStationId}
    />
  );
}
