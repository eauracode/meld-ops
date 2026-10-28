import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { fetchAll } from "@/lib/fetch-all";
import {
  change,
  dashboardStats,
  dmy,
  lagosToday,
  naira,
  periodRange,
  remitSummary,
  shiftPeriod,
  type DashOrder,
  type DashTally,
  type Grain,
  type Period,
} from "@/lib/calc";
import type { RemittanceLine, Rider } from "@/lib/types";
import { DashFilters } from "./dash-filters";
import { TrendChart } from "./trend-chart";

export const metadata = { title: "Overview · Meld Ops" };

type Search = { period?: string; date?: string; merchant?: string; rider?: string };

const PERIODS: Period[] = ["day", "week", "month", "year"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function periodLabel(period: Period, from: string, to: string): string {
  const [y, m, d] = from.split("-").map(Number);
  if (period === "day") return `${new Date(from + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" })} ${d} ${MONTHS[m - 1]} ${y}`;
  if (period === "week") {
    const [, m2, d2] = to.split("-").map(Number);
    return `${d} ${MONTHS[m - 1]} – ${d2} ${MONTHS[m2 - 1]} ${to.slice(0, 4)}`;
  }
  if (period === "month") return `${LONG_MONTHS[m - 1]} ${y}`;
  return String(y);
}

const prevName: Record<Period, string> = { day: "the day before", week: "last week", month: "last month", year: "last year" };
const pct = (r: number | null) => (r === null ? "—" : `${Math.round(r * 100)}%`);

/** "▲ 12% vs last month", coloured good or bad; the arrow carries the direction without colour. */
function Delta({ now, before, period, upIsBad }: { now: number; before: number; period: Period; upIsBad?: boolean }) {
  const c = change(now, before);
  if (c === null) return <span className="delta">No figure for {prevName[period]}</span>;
  if (Math.abs(c) < 0.005) return <span className="delta">Same as {prevName[period]}</span>;
  const up = c > 0;
  const good = upIsBad ? !up : up;
  return (
    <span className={`delta ${good ? "up" : "down"}`}>
      {up ? "▲" : "▼"} {Math.abs(Math.round(c * 100))}% vs {prevName[period]}
    </span>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { supabase, merchants } = await requireAdmin();
  const sp = await searchParams;

  const today = lagosToday();
  const period: Period = PERIODS.includes(sp.period as Period) ? (sp.period as Period) : "month";
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : today;
  const merchantId = merchants.some((m) => m.id === sp.merchant) ? sp.merchant! : "";
  const riderId = sp.rider ?? "";
  const { from, to } = periodRange(period, date);
  const prev = periodRange(period, shiftPeriod(period, date, -1));
  const grain: Grain = period === "year" ? "month" : "day";

  const ordersIn = (a: string, b: string) =>
    fetchAll<DashOrder>((x, y) => {
      let q = supabase
        .from("orders")
        .select("delivery_date,merchant_id,rider_id,status,order_value,rider_fee,amount_charged,payment,area")
        .gte("delivery_date", a)
        .lte("delivery_date", b)
        .order("id");
      if (merchantId) q = q.eq("merchant_id", merchantId);
      if (riderId === "__none") q = q.is("rider_id", null);
      else if (riderId) q = q.eq("rider_id", riderId);
      return q.range(x, y);
    });

  let unpaid = supabase
    .from("remittances")
    .select("other_deductions,remittance_lines(customer,product,qty,order_value,amount_charged,type)")
    .eq("status", "sent");
  if (merchantId) unpaid = unpaid.eq("merchant_id", merchantId);

  const [orders, prevOrders, { data: riderRows }, { data: owedRows }] = await Promise.all([
    ordersIn(from, to),
    ordersIn(prev.from, prev.to),
    supabase.from("riders").select("id,name,phone,active").order("name"),
    unpaid,
  ]);

  const s = dashboardStats(orders, from, to, grain);
  const p = dashboardStats(prevOrders, prev.from, prev.to, grain);
  const riders = (riderRows ?? []) as Rider[];
  const owed = (owedRows ?? []).map((r) => remitSummary((r.remittance_lines ?? []) as RemittanceLine[], r.other_deductions).expected);
  const owedTotal = owed.reduce((a, b) => a + b, 0);
  const riderName = (id: string) => (id ? (riders.find((r) => r.id === id)?.name ?? "Removed rider") : "Unassigned");
  const merchantName = (id: string) => merchants.find((m) => m.id === id)?.name ?? "Removed merchant";
  const activeMerchants = Object.keys(s.byMerchant).length;
  const activeRiders = Object.keys(s.byRider).filter((id) => id && s.byRider[id].orders > 0).length;
  const label = periodLabel(period, from, to);

  const href = (next: Partial<Search>) => {
    const q = new URLSearchParams();
    const m = { period, date, merchant: merchantId, rider: riderId, ...next };
    q.set("period", m.period);
    q.set("date", m.date);
    if (m.merchant) q.set("merchant", m.merchant);
    if (m.rider) q.set("rider", m.rider);
    return `/dashboard?${q}`;
  };

  const scope = [merchantId && merchantName(merchantId), riderId && riderName(riderId === "__none" ? "" : riderId)].filter(Boolean).join(" · ");
  const sortedRiders = Object.entries(s.byRider).sort((a, b) => b[1].delivered - a[1].delivered || b[1].orders - a[1].orders);
  const sortedMerchants = Object.entries(s.byMerchant).sort((a, b) => b[1].orderValue - a[1].orderValue || b[1].orders - a[1].orders);
  const rate = (t: DashTally) => (t.delivered + t.failed ? t.delivered / (t.delivered + t.failed) : null);
  const maxStatus = Math.max(1, ...Object.values(s.byStatus));
  const topAreas = s.byArea.slice(0, 8);
  const maxArea = Math.max(1, ...topAreas.map((a) => a.delivered));

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Overview</h1>
          <p>
            {label}
            {scope ? ` · ${scope}` : " · all merchants and riders"}
          </p>
        </div>
      </div>

      <DashFilters
        period={period}
        merchant={merchantId}
        rider={riderId}
        merchants={merchants}
        riders={riders}
        label={label}
        prevHref={href({ date: shiftPeriod(period, date, -1) })}
        nextHref={href({ date: shiftPeriod(period, date, 1) })}
        todayHref={href({ date: today })}
        isCurrent={today >= from && today <= to}
      />

      <section className="kpis" aria-label="Key figures">
        <div className="kpi">
          <span>Deliveries</span>
          <b>{s.delivered.toLocaleString("en-NG")}</b>
          <Delta now={s.delivered} before={p.delivered} period={period} />
        </div>
        <div className="kpi">
          <span>Success rate</span>
          <b>{pct(s.successRate)}</b>
          <span className="delta">
            {s.delivered} of {s.delivered + s.failed} finished
          </span>
        </div>
        <div className="kpi">
          <span>Order value delivered</span>
          <b>{naira(s.orderValue)}</b>
          <Delta now={s.orderValue} before={p.orderValue} period={period} />
        </div>
        <div className="kpi accent">
          <span>Revenue</span>
          <b>{naira(s.revenue)}</b>
          <Delta now={s.revenue} before={p.revenue} period={period} />
        </div>

        <div className="kpi">
          <span>Failed or returned</span>
          <b>{s.failed.toLocaleString("en-NG")}</b>
          <Delta now={s.failed} before={p.failed} period={period} upIsBad />
        </div>
        <div className="kpi">
          <span>Still open</span>
          <b>{s.open.toLocaleString("en-NG")}</b>
          <span className="delta">Pending, out for delivery or rescheduled</span>
        </div>
        <div className="kpi">
          <span>Cash collected (COD)</span>
          <b>{naira(s.cashCollected)}</b>
          <span className="delta">{naira(s.orderValue - s.cashCollected)} was already paid</span>
        </div>
        <div className="kpi">
          <span>Rider fees</span>
          <b>{naira(s.riderFees)}</b>
          <span className="delta">Charged to merchants {naira(s.charged)}</span>
        </div>

        <div className="kpi">
          <span>Merchants</span>
          <b>{merchantId ? 1 : merchants.length}</b>
          <span className="delta">{activeMerchants} with orders in this period</span>
        </div>
        <div className="kpi">
          <span>Riders</span>
          <b>{riders.filter((r) => r.active).length}</b>
          <span className="delta">
            active · {activeRiders} worked this period
          </span>
        </div>
        <div className="kpi">
          <span>Owed to merchants</span>
          <b>{naira(owedTotal)}</b>
          <span className="delta">
            {owed.length} remittance{owed.length === 1 ? "" : "s"} sent, not paid · all dates
          </span>
        </div>
        <div className="kpi">
          <span>Revenue per delivery</span>
          <b>{s.delivered ? naira(s.revenue / s.delivered) : "—"}</b>
          <span className="delta">Average Meld margin</span>
        </div>
      </section>

      {period !== "day" && (
        <section className="panel" style={{ marginBottom: 20 }}>
          <div className="panel-h">
            <h2>{grain === "month" ? "Deliveries per month" : "Deliveries per day"}</h2>
          </div>
          <div className="panel-b">
            <TrendChart data={s.trend} grain={grain} />
          </div>
        </section>
      )}

      <div className="dash-grid">
        <section className="panel">
          <div className="panel-h">
            <h2>By rider</h2>
            <span className="spacer" />
            <span className="small muted">Select a rider to see only their work</span>
          </div>
          {sortedRiders.length ? (
            <div className="tablewrap">
              <table className="cards">
                <thead>
                  <tr>
                    <th>Rider</th>
                    <th className="num">Delivered</th>
                    <th className="num">Failed</th>
                    <th className="num">Success</th>
                    <th className="num">Fees owed</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRiders.map(([id, t]) => (
                    <tr key={id || "none"}>
                      <td className="first" data-l="Rider">
                        <Link href={href({ rider: id || "__none" })}>{riderName(id)}</Link>
                      </td>
                      <td className="num" data-l="Delivered">
                        {t.delivered}
                      </td>
                      <td className="num" data-l="Failed">
                        {t.failed}
                      </td>
                      <td className="num" data-l="Success">
                        {pct(rate(t))}
                      </td>
                      <td className="num" data-l="Fees owed">
                        {naira(t.riderFees)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty muted">No orders in this period.</p>
          )}
        </section>

        <section className="panel">
          <div className="panel-h">
            <h2>By merchant</h2>
            <span className="spacer" />
            <span className="small muted">Select a merchant to filter</span>
          </div>
          {sortedMerchants.length ? (
            <div className="tablewrap">
              <table className="cards">
                <thead>
                  <tr>
                    <th>Merchant</th>
                    <th className="num">Delivered</th>
                    <th className="num">Failed</th>
                    <th className="num">Order value</th>
                    <th className="num">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedMerchants.map(([id, t]) => (
                    <tr key={id}>
                      <td className="first" data-l="Merchant">
                        <Link href={href({ merchant: id })}>{merchantName(id)}</Link>
                      </td>
                      <td className="num" data-l="Delivered">
                        {t.delivered}
                      </td>
                      <td className="num" data-l="Failed">
                        {t.failed}
                      </td>
                      <td className="num" data-l="Order value">
                        {naira(t.orderValue)}
                      </td>
                      <td className="num" data-l="Revenue">
                        {naira(t.revenue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty muted">No orders in this period.</p>
          )}
        </section>

        <section className="panel">
          <div className="panel-h">
            <h2>Orders by status</h2>
            <span className="spacer" />
            <span className="small muted">{s.orders} orders</span>
          </div>
          <div className="panel-b">
            {s.orders ? (
              <ul className="barlist">
                {["Delivered", "Out for delivery", "Pending", "Rescheduled", "Failed", "Returned"]
                  .filter((st) => s.byStatus[st])
                  .map((st) => (
                    <li key={st}>
                      <span>{st}</span>
                      <span className="bar" aria-hidden="true">
                        <i style={{ width: `${(s.byStatus[st] / maxStatus) * 100}%` }} />
                      </span>
                      <span className="num">{s.byStatus[st]}</span>
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="muted">No orders in this period.</p>
            )}
          </div>
        </section>

        <section className="panel">
          <div className="panel-h">
            <h2>Top delivery areas</h2>
            <span className="spacer" />
            <span className="small muted">Delivered orders</span>
          </div>
          <div className="panel-b">
            {topAreas.length ? (
              <ul className="barlist">
                {topAreas.map((a) => (
                  <li key={a.area}>
                    <span>{a.area}</span>
                    <span className="bar" aria-hidden="true">
                      <i style={{ width: `${(a.delivered / maxArea) * 100}%` }} />
                    </span>
                    <span className="num">{a.delivered}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No deliveries in this period.</p>
            )}
          </div>
        </section>
      </div>

      <p className="small muted" style={{ marginTop: 14 }}>
        {dmy(from)} to {dmy(to)}. Money figures count delivered orders only. Revenue is the amount charged to merchants minus rider fees.{" "}
        <Link href={`/report?from=${from}&to=${to}${merchantId ? `&merchant=${merchantId}` : "&merchant=__all"}`}>Open the delivery report</Link> for
        every order.
      </p>
    </>
  );
}
