"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useFeedback } from "@/components/feedback";
import type { Rider, RiderKind } from "@/lib/types";
import { addRider, setRiderActive, setRiderKind } from "@/app/actions/settings";

const KINDS: { id: RiderKind; label: string }[] = [
  { id: "partner", label: "Partner" },
  { id: "inhouse", label: "In-house" },
];

export function Riders({ riders, counts, isAdmin }: { riders: Rider[]; counts: Record<string, { total: number; delivered: number }>; isAdmin: boolean }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [kind, setKind] = useState<RiderKind>("partner");
  const [error, setError] = useState("");

  const add = async () => {
    const r = await addRider(name, phone, kind);
    if (!r.ok) return setError(r.error);
    setError("");
    toast(`${name.trim()} added`);
    setName("");
    setPhone("");
    setKind("partner");
    router.refresh();
  };

  const changeKind = async (r: Rider, next: RiderKind) => {
    const res = await setRiderKind(r.id, next);
    toast(res.ok ? `${r.name} is now ${next === "inhouse" ? "in-house" : "a partner"}. Applies to orders assigned from now on; past deliveries keep their type.` : res.error);
    router.refresh();
  };

  const toggle = async (r: Rider, active: boolean) => {
    const res = await setRiderActive(r.id, active);
    if (!res.ok) toast(res.error);
    router.refresh();
  };

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Riders</h1>
          <p>Only active riders appear in the order form. Partner riders are paid the rider fee per delivery; in-house riders are salaried, so Meld keeps the whole charge.</p>
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
              <label htmlFor="rdName">Name</label>
              <input className="input" id="rdName" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="rdPhone">Phone</label>
              <input className="input" id="rdPhone" inputMode="tel" placeholder="08031234567" value={phone} onChange={(e) => setPhone(e.target.value)} aria-describedby="rdErr" />
            </div>
            {isAdmin && (
              <div className="field">
                <label htmlFor="rdKind">Type</label>
                <select className="input" id="rdKind" value={kind} onChange={(e) => setKind(e.target.value as RiderKind)}>
                  {KINDS.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <button className="btn primary" type="submit">
              Add rider
            </button>
          </form>
          {error && (
            <p className="err" id="rdErr" role="alert" style={{ marginTop: 8 }}>
              {error}
            </p>
          )}
        </div>
      </section>
      <section className="panel">
        {riders.length ? (
          <div className="tablewrap">
            <table className="cards">
              <thead>
                <tr>
                  <th>Rider</th>
                  <th>Phone</th>
                  <th>Type</th>
                  <th className="num">Orders today</th>
                  <th className="num">Delivered today</th>
                  <th>Active</th>
                </tr>
              </thead>
              <tbody>
                {riders.map((r) => (
                  <tr key={r.id}>
                    <td className="first" data-l="Rider">
                      {r.name}
                    </td>
                    <td data-l="Phone">{r.phone}</td>
                    <td data-l="Type">
                      {isAdmin ? (
                        <select className="input" aria-label={`Type of ${r.name}`} value={r.kind ?? "partner"} onChange={(e) => changeKind(r, e.target.value as RiderKind)}>
                          {KINDS.map((k) => (
                            <option key={k.id} value={k.id}>
                              {k.label}
                            </option>
                          ))}
                        </select>
                      ) : r.kind === "inhouse" ? (
                        "In-house"
                      ) : (
                        "Partner"
                      )}
                    </td>
                    <td data-l="Orders today" className="num">
                      {counts[r.id]?.total ?? 0}
                    </td>
                    <td data-l="Delivered today" className="num">
                      {counts[r.id]?.delivered ?? 0}
                    </td>
                    <td data-l="Active">
                      <label className="switch">
                        <input type="checkbox" checked={r.active} onChange={(e) => toggle(r, e.target.checked)} aria-label={`${r.name} active`} />
                        <i />
                        <span>{r.active ? "Active" : "Inactive"}</span>
                      </label>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            <h3>No riders yet</h3>
            <p>Add your first rider above to start assigning orders.</p>
          </div>
        )}
      </section>
    </>
  );
}
