import { requireAdmin } from "@/lib/session";
import { loadStations } from "@/lib/stations";
import { fetchAll } from "@/lib/fetch-all";
import { Stations, type StationTotal } from "./stations";

export const metadata = { title: "Stations · Meld Ops" };

type Row = { station_id: string; qty: number; products: { merchant_id: string } | null };

export default async function StationsPage() {
  const { supabase } = await requireAdmin();
  const stations = await loadStations(supabase);
  if (!stations) {
    return (
      <>
        <div className="pagehead">
          <h1>Stations</h1>
        </div>
        <section className="panel">
          <div className="empty">
            <h3>One database step first</h3>
            <p>Run supabase/migrations/005_stations_and_backup.sql in Supabase (SQL Editor), then reload this page.</p>
          </div>
        </section>
      </>
    );
  }

  const rows = await fetchAll<Row>((a, b) => supabase.from("station_stock").select("station_id,qty,products(merchant_id)").order("station_id").range(a, b));
  const totals: Record<string, StationTotal> = {};
  for (const r of rows) {
    const t = (totals[r.station_id] ??= { units: 0, merchants: 0, ids: [] });
    t.units += r.qty;
    const m = r.products?.merchant_id;
    if (m && r.qty > 0 && !t.ids.includes(m)) {
      t.ids.push(m);
      t.merchants++;
    }
  }
  return <Stations stations={stations} totals={totals} />;
}
