"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Period } from "@/lib/calc";
import type { Merchant, Rider } from "@/lib/types";

const PERIODS: { id: Period; label: string }[] = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "year", label: "Year" },
];

export function DashFilters({
  period,
  merchant,
  rider,
  merchants,
  riders,
  label,
  prevHref,
  nextHref,
  todayHref,
  isCurrent,
}: {
  period: Period;
  merchant: string;
  rider: string;
  merchants: Merchant[];
  riders: Rider[];
  label: string;
  prevHref: string;
  nextHref: string;
  todayHref: string;
  isCurrent: boolean;
}) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const go = (key: string, value: string) => {
    const q = new URLSearchParams(params);
    if (value) q.set(key, value);
    else q.delete(key);
    router.replace(`${path}?${q}`, { scroll: false });
  };
  const periodHref = (p: Period) => {
    const q = new URLSearchParams(params);
    q.set("period", p);
    return `${path}?${q}`;
  };

  return (
    <div className="filters dash-filters">
      <div className="field">
        <span className="lbl">Period</span>
        <div className="seg" role="group" aria-label="Period">
          {PERIODS.map((p) => (
            <Link key={p.id} href={periodHref(p.id)} replace scroll={false} aria-current={period === p.id}>
              {p.label}
            </Link>
          ))}
        </div>
      </div>
      <div className="field">
        <span className="lbl">Showing</span>
        <div className="stepper">
          <Link className="btn sm" href={prevHref} replace scroll={false} aria-label={`Previous ${period}`}>
            ‹
          </Link>
          <span className="steplabel">{label}</span>
          <Link className="btn sm" href={nextHref} replace scroll={false} aria-label={`Next ${period}`}>
            ›
          </Link>
          {!isCurrent && (
            <Link className="btn sm link" href={todayHref} replace scroll={false}>
              Now
            </Link>
          )}
        </div>
      </div>
      <div className="field">
        <label htmlFor="df-m">Merchant</label>
        <select className="input" id="df-m" value={merchant} onChange={(e) => go("merchant", e.target.value)}>
          <option value="">All merchants</option>
          {merchants.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="df-r">Rider</label>
        <select className="input" id="df-r" value={rider} onChange={(e) => go("rider", e.target.value)}>
          <option value="">All riders</option>
          <option value="__none">Unassigned</option>
          {riders.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
              {r.active ? "" : " (inactive)"}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
