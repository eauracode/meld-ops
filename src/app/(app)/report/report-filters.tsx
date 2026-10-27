"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { Merchant, Rider } from "@/lib/types";

type F = { from: string; to: string; merchant: string; rider: string; view: string };

export function ReportFilters({ merchants, riders, ...f }: F & { merchants: Merchant[]; riders: Rider[] }) {
  const router = useRouter();
  const path = usePathname();
  const href = (next: Partial<F>) => {
    const m = { ...f, ...next };
    if (m.to < m.from) {
      if (next.from) m.to = m.from;
      else m.from = m.to;
    }
    const p = new URLSearchParams({ from: m.from, to: m.to, merchant: m.merchant, view: m.view });
    if (m.rider) p.set("rider", m.rider);
    return `${path}?${p}`;
  };
  const go = (next: Partial<F>) => router.replace(href(next), { scroll: false });

  return (
    <div className="filters" style={{ marginBottom: 16 }}>
      <div className="field">
        <label htmlFor="rf-from">From</label>
        <input className="input" type="date" id="rf-from" value={f.from} onChange={(e) => e.target.value && go({ from: e.target.value })} />
      </div>
      <div className="field">
        <label htmlFor="rf-to">To</label>
        <input className="input" type="date" id="rf-to" value={f.to} onChange={(e) => e.target.value && go({ to: e.target.value })} />
      </div>
      <div className="field">
        <label htmlFor="rf-m">Merchant</label>
        <select className="input" id="rf-m" value={f.merchant} onChange={(e) => go({ merchant: e.target.value })}>
          {merchants.length > 1 && <option value="__all">All merchants</option>}
          {merchants.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="rf-r">Rider</label>
        <select className="input" id="rf-r" value={f.rider} onChange={(e) => go({ rider: e.target.value })}>
          <option value="">All riders</option>
          {riders.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <span className="lbl">View</span>
        <div className="seg" role="group" aria-label="Group report">
          <Link href={href({ view: "orders" })} replace scroll={false} aria-current={f.view === "orders"}>
            Orders
          </Link>
          <Link href={href({ view: "riders" })} replace scroll={false} aria-current={f.view === "riders"}>
            By rider
          </Link>
        </div>
      </div>
    </div>
  );
}
