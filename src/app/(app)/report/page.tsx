import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { dmy, lagosToday, naira, reportTotals } from "@/lib/calc";
import { NoMerchant } from "@/components/no-merchant";
import { ReportFilters } from "./report-filters";
import { ExportCsv, type CsvRow } from "./export-csv";
import type { Order, Rider } from "@/lib/types";

export const metadata = { title: "Delivery report · Meld Ops" };

type Search = { from?: string; to?: string; merchant?: string; rider?: string; view?: string };
const isDate = (s?: string) => Boolean(s && /^\d{4}-\d{2}-\d{2}$/.test(s));

export default async function ReportPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { supabase, merchant, merchants } = await requireAdmin();
  if (!merchant) return <NoMerchant title="Delivery report" admin />;

  const sp = await searchParams;
  const today = lagosToday();
  let from = isDate(sp.from) ? sp.from! : today;
  let to = isDate(sp.to) ? sp.to! : from;
  if (to < from) [from, to] = [to, from];
  const all = sp.merchant === "__all";
  const merchantId = all ? null : merchants.some((m) => m.id === sp.merchant) ? sp.merchant! : merchant.id;
  const view = sp.view === "riders" ? "riders" : "orders";
  const riderId = sp.rider ?? "";

  let q = supabase
    .from("orders")
    .select("id,merchant_id,delivery_date,customer,address,area,pickup_station,product,qty,order_value,rider_fee,amount_charged,rider_id,notes")
    .eq("status", "Delivered")
    .gte("delivery_date", from)
    .lte("delivery_date", to)
    .order("delivery_date")
    .order("created_at")
    .limit(5000);
  if (merchantId) q = q.eq("merchant_id", merchantId);
  if (riderId) q = q.eq("rider_id", riderId);

  const [{ data }, { data: riderRows }] = await Promise.all([q, supabase.from("riders").select("id,name,phone,active").order("name")]);
  const rows = (data ?? []) as Order[];
  const riders = (riderRows ?? []) as Rider[];
  const riderName = (id: string | null) => riders.find((r) => r.id === id)?.name ?? "";
  const merchantName = (id: string) => merchants.find((m) => m.id === id)?.name ?? "";
  const t = reportTotals(rows);
  const range = from === to ? dmy(from) : `${dmy(from)} to ${dmy(to)}`;

  const csv: CsvRow[] = rows.map((o) => ({
    Date: dmy(o.delivery_date),
    Merchant: merchantName(o.merchant_id),
    Customer: o.customer,
    Pickup: o.pickup_station,
    "Delivery location": o.address,
    "Order value": o.order_value,
    "Rider fee": o.rider_fee,
    "Amount charged": o.amount_charged,
    Revenue: o.amount_charged - o.rider_fee,
    Rider: riderName(o.rider_id),
    Product: o.product,
    Qty: o.qty,
    Comment: o.notes,
  }));

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Delivery report</h1>
          <p>Every order marked Delivered, {range}. Live from the orders, nothing to sync.</p>
        </div>
        <span className="spacer" />
        {rows.length > 0 && <ExportCsv rows={csv} filename={`meld-delivery-report-${from}${to !== from ? `-to-${to}` : ""}.csv`} />}
      </div>
      <ReportFilters
        from={from}
        to={to}
        merchant={all ? "__all" : merchantId!}
        rider={riderId}
        view={view}
        merchants={merchants}
        riders={riders}
      />
      <div className="totals">
        <div>
          <span>Deliveries</span>
          <b>{t.deliveries}</b>
        </div>
        <div>
          <span>Order value</span>
          <b>{naira(t.orderValue)}</b>
        </div>
        <div>
          <span>Amount charged</span>
          <b>{naira(t.charged)}</b>
        </div>
        <div>
          <span>Rider fees</span>
          <b>{naira(t.riderFees)}</b>
        </div>
        <div className="rev">
          <span>Revenue</span>
          <b>{naira(t.revenue)}</b>
        </div>
      </div>
      <section className="panel">
        {!rows.length ? (
          <div className="empty">
            <h3>No deliveries to report</h3>
            <p>
              No orders marked Delivered for {all ? "any merchant" : merchantName(merchantId!)} on {range}
              {riderId ? ` by ${riderName(riderId)}` : ""}.
            </p>
            <Link className="btn" href="/orders">
              Go to orders
            </Link>
          </div>
        ) : view === "riders" ? (
          <div className="tablewrap">
            <table className="cards">
              <thead>
                <tr>
                  <th>Rider</th>
                  <th className="num">Deliveries</th>
                  <th className="num">Order value</th>
                  <th className="num">Rider fees owed</th>
                  <th className="num">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(t.byRider)
                  .sort((a, b) => b[1].deliveries - a[1].deliveries)
                  .map(([id, r]) => (
                    <tr key={id || "none"}>
                      <td className="first" data-l="Rider">
                        {riderName(id) || "Unassigned"}
                      </td>
                      <td data-l="Deliveries" className="num">
                        {r.deliveries}
                      </td>
                      <td data-l="Order value" className="num">
                        {naira(r.orderValue)}
                      </td>
                      <td data-l="Rider fees owed" className="num">
                        <b>{naira(r.riderFees)}</b>
                      </td>
                      <td data-l="Revenue" className="num">
                        {naira(r.revenue)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="tablewrap">
            <table className="cards">
              <thead>
                <tr>
                  <th>Date</th>
                  {all && <th>Merchant</th>}
                  <th>Customer</th>
                  <th>Pickup → delivery</th>
                  <th>Rider</th>
                  <th>Product</th>
                  <th className="num">Order value</th>
                  <th className="num">Rider fee</th>
                  <th className="num">Charged</th>
                  <th className="num">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.id}>
                    <td data-l="Date">{dmy(o.delivery_date)}</td>
                    {all && <td data-l="Merchant">{merchantName(o.merchant_id)}</td>}
                    <td className="first" data-l="Customer">
                      {o.customer}
                    </td>
                    <td data-l="Route" className="small">
                      {o.pickup_station || "—"} → {o.area || o.address}
                    </td>
                    <td data-l="Rider">{riderName(o.rider_id) || "—"}</td>
                    <td data-l="Product">
                      {o.product} × {o.qty}
                    </td>
                    <td data-l="Order value" className="num">
                      {naira(o.order_value)}
                    </td>
                    <td data-l="Rider fee" className="num">
                      {naira(o.rider_fee)}
                    </td>
                    <td data-l="Charged" className="num">
                      {naira(o.amount_charged)}
                      <span className="tag" title={`Rider fee + ${naira(o.amount_charged - o.rider_fee)} markup`}>
                        auto
                      </span>
                    </td>
                    <td data-l="Revenue" className="num">
                      {naira(o.amount_charged - o.rider_fee)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {rows.length > 0 && (
          <div className="stockline">
            <b>Stock out of pickup:</b>
            <span>{t.units} units</span>
            <span className="muted">
              {Object.entries(t.byProduct)
                .map(([p, n]) => `${p} ${n}`)
                .join(" · ")}
            </span>
          </div>
        )}
      </section>
    </>
  );
}
