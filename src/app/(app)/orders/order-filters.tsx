"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { STATUSES } from "@/lib/calc";
import type { Rider } from "@/lib/types";

type F = { date: string; status: string; rider: string; q: string };

export function OrderFilters({ filters, riders }: { filters: F; riders: Rider[] }) {
  const router = useRouter();
  const path = usePathname();
  const [q, setQ] = useState(filters.q);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const go = (next: Partial<F>) => {
    const merged = { ...filters, q, ...next };
    const params = new URLSearchParams();
    // An empty date means "all dates", which must be explicit because no date means today.
    params.set("date", merged.date);
    if (merged.status) params.set("status", merged.status);
    if (merged.rider) params.set("rider", merged.rider);
    if (merged.q) params.set("q", merged.q);
    router.replace(`${path}?${params}`, { scroll: false });
  };

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <div className="filters" style={{ marginBottom: 16 }}>
      <div className="field">
        <label htmlFor="of-date">Date</label>
        <input className="input" type="date" id="of-date" value={filters.date} onChange={(e) => go({ date: e.target.value })} />
      </div>
      <div className="field">
        <label htmlFor="of-status">Status</label>
        <select className="input" id="of-status" value={filters.status} onChange={(e) => go({ status: e.target.value })}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="of-rider">Rider</label>
        <select className="input" id="of-rider" value={filters.rider} onChange={(e) => go({ rider: e.target.value })}>
          <option value="">All riders</option>
          <option value="__none">Unassigned</option>
          {riders.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field" style={{ flex: 1, minWidth: 200 }}>
        <label htmlFor="of-q">Search</label>
        <input
          className="input"
          id="of-q"
          type="search"
          value={q}
          placeholder="Name, phone or order number"
          onChange={(e) => {
            const v = e.target.value;
            setQ(v);
            clearTimeout(timer.current);
            timer.current = setTimeout(() => go({ q: v }), 300);
          }}
        />
      </div>
    </div>
  );
}
