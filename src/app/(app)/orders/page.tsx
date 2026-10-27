import Link from "next/link";
import { getSession } from "@/lib/session";
import { STATUSES, dmy, lagosToday } from "@/lib/calc";
import { NoMerchant } from "@/components/no-merchant";
import { OrdersTable } from "./orders-table";
import { OrderFilters } from "./order-filters";
import type { Order, Rider } from "@/lib/types";

export const metadata = { title: "Orders · Meld Ops" };

type Search = { date?: string; status?: string; rider?: string; q?: string };

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { supabase, merchant, profile } = await getSession();
  if (!merchant) return <NoMerchant title="Orders" admin={profile.role === "admin"} />;

  const sp = await searchParams;
  const f = {
    date: sp.date === undefined ? lagosToday() : /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : "",
    status: (STATUSES as readonly string[]).includes(sp.status ?? "") ? sp.status! : "",
    rider: sp.rider ?? "",
    q: (sp.q ?? "").trim().slice(0, 80),
  };

  let query = supabase
    .from("orders")
    .select("id,merchant_id,delivery_date,customer,phone,address,area,product,qty,order_value,rider_fee,amount_charged,status,rider_id,created_at")
    .eq("merchant_id", merchant.id)
    .order("created_at", { ascending: false })
    .limit(500);
  if (f.date) query = query.eq("delivery_date", f.date);
  if (f.status) query = query.eq("status", f.status);
  if (f.rider === "__none") query = query.is("rider_id", null);
  else if (f.rider) query = query.eq("rider_id", f.rider);
  if (f.q) {
    const term = f.q.replace(/[%_,().*\\]/g, " ").trim();
    const id = Number(term.replace(/^mld-?/i, ""));
    const ors = [`customer.ilike.*${term}*`, `phone.ilike.*${term}*`, `address.ilike.*${term}*`];
    if (Number.isInteger(id) && id > 0) ors.push(`id.eq.${id}`);
    if (term) query = query.or(ors.join(","));
  }

  const [{ data: orders }, { data: riders }] = await Promise.all([query, supabase.from("riders").select("id,name,phone,active").order("name")]);
  const list = (orders ?? []) as Order[];

  const what = [f.date && `on ${dmy(f.date)}`, f.status && `with status ${f.status}`].filter(Boolean).join(" ");

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Orders</h1>
          <p>{merchant.name}. Assign riders and update status in the row.</p>
        </div>
        <span className="spacer" />
        <Link className="btn primary" href="/new">
          New order
        </Link>
      </div>
      <OrderFilters filters={f} riders={(riders ?? []) as Rider[]} />
      <section className="panel">
        {list.length ? (
          <OrdersTable orders={list} riders={(riders ?? []) as Rider[]} />
        ) : (
          <div className="empty">
            <h3>No orders match</h3>
            <p>
              Nothing for {merchant.name}
              {what ? ` ${what}` : ""}. Change the filters or add an order.
            </p>
            <Link className="btn primary" href="/new">
              New order
            </Link>
          </div>
        )}
      </section>
      {list.length > 0 && (
        <p className="small muted" style={{ marginTop: 10 }}>
          {list.length} order{list.length > 1 ? "s" : ""}
          {list.length === 500 ? " (showing the latest 500)" : ""}
        </p>
      )}
    </>
  );
}
