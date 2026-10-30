import { requireAdmin } from "@/lib/session";
import { defaultStation, loadStations } from "@/lib/stations";
import { MerchantSettings, AddMerchantButton } from "./merchant-settings";
import type { Product, Rate, StationStock, StockMove } from "@/lib/types";

export const metadata = { title: "Merchant settings · Meld Ops" };

export default async function MerchantsPage() {
  const { supabase, merchant } = await requireAdmin();
  if (!merchant) {
    return (
      <>
        <div className="pagehead">
          <div>
            <h1>Merchant settings</h1>
            <p>Add the merchants Meld delivers for.</p>
          </div>
        </div>
        <section className="panel">
          <div className="empty">
            <h3>No merchants yet</h3>
            <p>Each merchant gets a pickup address, products and a delivery rate card. New merchants start with the standard Lagos rate card.</p>
            <AddMerchantButton primary />
          </div>
        </section>
      </>
    );
  }

  const [{ data: products }, { data: rates }, stations, defaultStationId] = await Promise.all([
    supabase.from("products").select("id,merchant_id,name,price,stock").eq("merchant_id", merchant.id).order("name"),
    supabase.from("rates").select("merchant_id,area,rider_fee").eq("merchant_id", merchant.id).order("area"),
    loadStations(supabase),
    defaultStation(supabase, merchant.id),
  ]);
  const productList = (products ?? []) as Product[];

  let stock: StationStock[] = [];
  let moves: StockMove[] = [];
  let people: Record<string, string> = {};
  if (stations) {
    const [{ data: s }, { data: m }, { data: p }] = await Promise.all([
      supabase
        .from("station_stock")
        .select("product_id,station_id,qty")
        .in(
          "product_id",
          productList.map((x) => x.id),
        ),
      supabase
        .from("stock_moves")
        .select("id,product,kind,qty,from_station,to_station,order_id,note,created_by,created_at")
        .eq("merchant_id", merchant.id)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase.from("profiles").select("id,name,email"),
    ]);
    stock = (s ?? []) as StationStock[];
    moves = (m ?? []) as StockMove[];
    people = Object.fromEntries((p ?? []).map((x) => [x.id as string, (x.name as string) || (x.email as string)]));
  }

  return (
    <MerchantSettings
      key={merchant.id}
      merchant={merchant}
      products={productList}
      rates={(rates ?? []) as Rate[]}
      stations={stations}
      stock={stock}
      moves={moves}
      people={people}
      defaultStationId={defaultStationId}
    />
  );
}
