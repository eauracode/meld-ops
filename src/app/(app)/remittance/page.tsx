import { requireAdmin } from "@/lib/session";
import { addDays, dmy, lagosToday, remitSummary } from "@/lib/calc";
import { NoMerchant } from "@/components/no-merchant";
import { RemitDate, GenerateButton } from "./controls";
import { RemitEditor } from "./remit-editor";
import type { Remittance, RemittanceLine } from "@/lib/types";

export const metadata = { title: "Remittance · Meld Ops" };

export default async function RemittancePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { supabase, merchant } = await requireAdmin();
  if (!merchant) return <NoMerchant title="Remittance" admin />;

  const sp = await searchParams;
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : addDays(lagosToday(), -1);

  const [{ data: remit }, { data: history }, { count }, { data: products }] = await Promise.all([
    supabase
      .from("remittances")
      // "*" so the page still loads before migration 002 adds stock_snapshot.
      .select("*")
      .eq("merchant_id", merchant.id)
      .eq("remit_date", date)
      .maybeSingle(),
    supabase
      .from("remittances")
      .select("id,remit_date,status,other_deductions,remittance_lines(customer,product,qty,order_value,amount_charged,type)")
      .eq("merchant_id", merchant.id)
      .neq("status", "draft")
      .order("remit_date", { ascending: false })
      .limit(30),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("merchant_id", merchant.id)
      .eq("delivery_date", date)
      .in("status", ["Delivered", "Failed", "Returned"]),
    supabase.from("products").select("name,stock").eq("merchant_id", merchant.id).order("name"),
  ]);

  let lines: RemittanceLine[] = [];
  if (remit) {
    const { data } = await supabase
      .from("remittance_lines")
      .select("id,order_id,position,customer,product,qty,order_value,amount_charged,type")
      .eq("remittance_id", remit.id)
      .order("position");
    lines = (data ?? []) as RemittanceLine[];
  }

  const hist = (history ?? []).map((h) => ({
    id: h.id as string,
    date: h.remit_date as string,
    status: h.status as "sent" | "paid",
    expected: remitSummary((h.remittance_lines ?? []) as RemittanceLine[], h.other_deductions).expected,
  }));
  const ready = count ?? 0;

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Remittance</h1>
          <p>Cash collected for {merchant.name} on one day, minus Meld’s fees. One remittance per merchant per day.</p>
        </div>
      </div>
      <div className="filters" style={{ marginBottom: 16 }}>
        <RemitDate date={date} />
        {!remit && <GenerateButton merchantId={merchant.id} date={date} />}
      </div>
      {remit ? (
        <RemitEditor
          key={`${remit.id}-${remit.status}`}
          merchant={merchant}
          remit={remit as Remittance}
          initialLines={lines}
          products={(products ?? []) as { name: string; stock: number }[]}
          history={hist}
        />
      ) : (
        <section className="panel">
          <div className="empty">
            <h3>No remittance for {dmy(date)} yet</h3>
            <p>
              {ready
                ? `${ready} finished order${ready > 1 ? "s" : ""} (delivered, waybill, failed or returned) ${ready > 1 ? "are" : "is"} ready for ${merchant.name}.`
                : `No finished orders for ${merchant.name} on this date. You can still generate one and add lines by hand.`}
            </p>
            <GenerateButton merchantId={merchant.id} date={date} />
          </div>
        </section>
      )}
    </>
  );
}
