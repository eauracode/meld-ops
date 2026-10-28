"use client";

import { useState } from "react";
import type { Grain } from "@/lib/calc";

type Point = { key: string; delivered: number; failed: number };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Four equal round steps (1, 2 or 5 × 10ⁿ each) reaching at least the tallest bar. */
function niceMax(n: number): number {
  const raw = Math.max(1, n / 4);
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * p).find((v) => v >= raw)!;
  return step * 4;
}

const tick = (k: string, grain: Grain) => (grain === "month" ? MONTHS[Number(k.slice(5, 7)) - 1] : String(Number(k.slice(8, 10))));
const full = (k: string, grain: Grain) =>
  grain === "month" ? `${MONTHS[Number(k.slice(5, 7)) - 1]} ${k.slice(0, 4)}` : `${Number(k.slice(8, 10))} ${MONTHS[Number(k.slice(5, 7)) - 1]} ${k.slice(0, 4)}`;

/** Stacked bars: delivered (bottom) and failed or returned (top) per day or month. */
export function TrendChart({ data, grain }: { data: Point[]; grain: Grain }) {
  const [active, setActive] = useState<number | null>(null);
  const max = niceMax(Math.max(0, ...data.map((d) => d.delivered + d.failed)));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f));
  // Thin the x labels so they never collide: at most ~12 visible.
  const every = Math.max(1, Math.ceil(data.length / 12));
  const totalDelivered = data.reduce((a, d) => a + d.delivered, 0);
  const totalFailed = data.reduce((a, d) => a + d.failed, 0);
  const a = active === null ? null : data[active];

  return (
    <div className="trend">
      <div className="legend" aria-hidden="true">
        <span>
          <i className="sw delivered" /> Delivered <b>{totalDelivered}</b>
        </span>
        <span>
          <i className="sw failed" /> Failed or returned <b>{totalFailed}</b>
        </span>
      </div>

      <div className="plot" onMouseLeave={() => setActive(null)}>
        <div className="yaxis" aria-hidden="true">
          {ticks.map((t) => (
            <span key={t} style={{ bottom: `${(t / max) * 100}%` }}>
              {t}
            </span>
          ))}
        </div>
        <div className="bars">
          {ticks.map((t) => (
            <span key={t} className="grid" style={{ bottom: `${(t / max) * 100}%` }} aria-hidden="true" />
          ))}
          {data.map((d, i) => (
            <div
              key={d.key}
              className={`col${active === i ? " on" : ""}`}
              tabIndex={0}
              role="img"
              aria-label={`${full(d.key, grain)}: ${d.delivered} delivered, ${d.failed} failed or returned`}
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
            >
              <div className="stack">
                {d.failed > 0 && <span className="seg failed" style={{ height: `${(d.failed / max) * 100}%` }} />}
                {d.delivered > 0 && <span className="seg delivered" style={{ height: `${(d.delivered / max) * 100}%` }} />}
              </div>
              <span className="xl" aria-hidden="true">
                {i % every === 0 ? tick(d.key, grain) : ""}
              </span>
            </div>
          ))}
          {a && active !== null && (
            <div
              className="tip"
              role="status"
              style={{
                left: `${((active + 0.5) / data.length) * 100}%`,
                // Keep it inside the chart near either edge.
                transform: `translateX(${active < data.length * 0.15 ? "-10%" : active > data.length * 0.85 ? "-90%" : "-50%"})`,
              }}
            >
              <b>{full(a.key, grain)}</b>
              <span>
                <i className="sw delivered" /> Delivered {a.delivered}
              </span>
              <span>
                <i className="sw failed" /> Failed or returned {a.failed}
              </span>
            </div>
          )}
        </div>
      </div>

      <details className="tableview">
        <summary>Show as table</summary>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>{grain === "month" ? "Month" : "Day"}</th>
                <th className="num">Delivered</th>
                <th className="num">Failed or returned</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.key}>
                  <td>{full(d.key, grain)}</td>
                  <td className="num">{d.delivered}</td>
                  <td className="num">{d.failed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
