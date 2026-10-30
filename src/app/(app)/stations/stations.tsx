"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useFeedback } from "@/components/feedback";
import type { Station } from "@/lib/types";
import { addStation, saveStation } from "@/app/actions/stock";

export type StationTotal = { units: number; merchants: number; ids: string[] };

export function Stations({ stations, totals }: { stations: Station[]; totals: Record<string, StationTotal> }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");

  const add = async () => {
    const r = await addStation(name, address);
    if (!r.ok) return setError(r.error);
    setError("");
    toast(`${name.trim()} added`);
    setName("");
    setAddress("");
    router.refresh();
  };

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Stations</h1>
          <p>Where merchants’ stock is kept. Move stock between stations from Merchant settings.</p>
        </div>
      </div>
      <section className="panel" style={{ marginBottom: 20 }}>
        <div className="panel-b">
          <form
            className="filters"
            onSubmit={(e) => {
              e.preventDefault();
              void add();
            }}
          >
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="stName">Station name</label>
              <input className="input" id="stName" placeholder="e.g. Ikeja hub" value={name} onChange={(e) => setName(e.target.value)} aria-describedby="stErr" />
            </div>
            <div className="field" style={{ flex: 2 }}>
              <label htmlFor="stAddr">Address</label>
              <input className="input" id="stAddr" value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <button className="btn primary" type="submit">
              Add station
            </button>
          </form>
          {error && (
            <p className="err" id="stErr" role="alert" style={{ marginTop: 8 }}>
              {error}
            </p>
          )}
        </div>
      </section>
      <section className="panel">
        <div className="tablewrap">
          <table className="cards">
            <thead>
              <tr>
                <th>Station</th>
                <th>Address</th>
                <th className="num">Units held</th>
                <th className="num">Merchants</th>
                <th>Active</th>
              </tr>
            </thead>
            <tbody>
              {stations.map((s) => (
                <StationRow key={`${s.id}-${s.name}-${s.address}-${s.active}`} station={s} total={totals[s.id]} />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function StationRow({ station, total }: { station: Station; total?: StationTotal }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [v, setV] = useState({ name: station.name, address: station.address, active: station.active });

  const save = async (next: typeof v) => {
    if (next.name === station.name && next.address === station.address && next.active === station.active) return;
    const r = await saveStation(station.id, next);
    if (!r.ok) {
      setV({ name: station.name, address: station.address, active: station.active });
      return toast(r.error);
    }
    if (next.active !== station.active) toast(`${next.name} is now ${next.active ? "active" : "inactive"}`);
    router.refresh();
  };

  return (
    <tr>
      <td className="first" data-l="Station">
        <input className="input" aria-label="Station name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} onBlur={() => save(v)} />
      </td>
      <td data-l="Address">
        <input className="input" aria-label={`Address of ${station.name}`} value={v.address} onChange={(e) => setV({ ...v, address: e.target.value })} onBlur={() => save(v)} />
      </td>
      <td data-l="Units held" className="num">
        {total?.units ?? 0}
      </td>
      <td data-l="Merchants" className="num">
        {total?.merchants ?? 0}
      </td>
      <td data-l="Active">
        <label className="switch">
          <input
            type="checkbox"
            checked={v.active}
            onChange={(e) => {
              const next = { ...v, active: e.target.checked };
              setV(next);
              void save(next);
            }}
            aria-label={`${station.name} active`}
          />
          <i />
          <span>{v.active ? "Active" : "Inactive"}</span>
        </label>
      </td>
    </tr>
  );
}
