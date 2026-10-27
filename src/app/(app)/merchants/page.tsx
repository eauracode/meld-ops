import { requireAdmin } from "@/lib/session";
import { MerchantSettings, AddMerchantButton } from "./merchant-settings";
import type { Product, Rate } from "@/lib/types";

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

  const [{ data: products }, { data: rates }] = await Promise.all([
    supabase.from("products").select("id,merchant_id,name,price,stock").eq("merchant_id", merchant.id).order("name"),
    supabase.from("rates").select("merchant_id,area,rider_fee").eq("merchant_id", merchant.id).order("area"),
  ]);
  return <MerchantSettings key={merchant.id} merchant={merchant} products={(products ?? []) as Product[]} rates={(rates ?? []) as Rate[]} />;
}
