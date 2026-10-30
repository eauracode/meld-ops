"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { useFeedback } from "@/components/feedback";
import { charged, naira, toNum } from "@/lib/calc";
import type { Merchant, Product, Rate, Station, StationStock, StockMove } from "@/lib/types";
import { addMerchant, deleteProduct, deleteRate, saveMerchant, setRate, upsertProduct } from "@/app/actions/settings";
import { setDefaultStation } from "@/app/actions/stock";
import { StockHistory, StockPanel } from "./stock-panel";

export function AddMerchantButton({ primary }: { primary?: boolean }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const dlg = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState("");
  const [pickup, setPickup] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!name.trim()) return document.getElementById("nmName")?.focus();
    setBusy(true);
    const r = await addMerchant(name, pickup);
    setBusy(false);
    if (!r.ok) return toast(r.error);
    dlg.current?.close();
    toast(`${name.trim()} added`);
    setName("");
    setPickup("");
    router.refresh();
  };
  return (
    <>
      <button className={`btn${primary ? " primary" : ""}`} type="button" onClick={() => dlg.current?.showModal()}>
        Add merchant
      </button>
      <dialog ref={dlg} aria-labelledby="nm-title">
        <div className="dlg-h">
          <h2 id="nm-title">Add merchant</h2>
        </div>
        <div className="dlg-b" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="field">
            <label htmlFor="nmName">Business name</label>
            <input className="input" id="nmName" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="field">
            <label htmlFor="nmPick">Pickup address</label>
            <input className="input" id="nmPick" value={pickup} onChange={(e) => setPickup(e.target.value)} />
          </div>
          <p className="small muted">Starts with the standard Lagos rate card. You can edit it after.</p>
        </div>
        <div className="dlg-f">
          <button className="btn" type="button" onClick={() => dlg.current?.close()}>
            Cancel
          </button>
          <button className="btn primary" type="button" onClick={submit} disabled={busy}>
            Add merchant
          </button>
        </div>
      </dialog>
    </>
  );
}

export function MerchantSettings({
  merchant,
  products,
  rates,
  stations,
  stock,
  moves,
  people,
  defaultStationId,
}: {
  merchant: Merchant;
  products: Product[];
  rates: Rate[];
  /** null until migration 005 is run */
  stations: Station[] | null;
  stock: StationStock[];
  moves: StockMove[];
  people: Record<string, string>;
  defaultStationId: string | null;
}) {
  const router = useRouter();
  const { toast } = useFeedback();
  const activeStations = (stations ?? []).filter((s) => s.active);
  const openingStation = activeStations.find((s) => s.id === defaultStationId)?.id ?? activeStations[0]?.id ?? null;

  const changeDefaultStation = async (id: string) => {
    const r = await setDefaultStation(merchant.id, id || null);
    toast(r.ok ? (id ? `New orders now default to ${activeStations.find((s) => s.id === id)?.name}` : "New orders now default to no station") : r.error);
    router.refresh();
  };
  const [details, setDetails] = useState({ name: merchant.name, phone: merchant.phone, email: merchant.email, pickup_address: merchant.pickup_address });
  const [q, setQ] = useState("");
  const [newArea, setNewArea] = useState("");
  const [newFee, setNewFee] = useState("");
  const [newProduct, setNewProduct] = useState({ name: "", price: "", stock: "" });
  const shown = rates.filter((r) => r.area.toLowerCase().includes(q.toLowerCase()));

  const saveDetails = async () => {
    const r = await saveMerchant(merchant.id, details);
    toast(r.ok ? "Changes saved" : r.error);
    if (r.ok) router.refresh();
  };

  const saveProduct = async (p: Product, patch: Partial<Product>) => {
    const next = { ...p, ...patch };
    if (next.name === p.name && next.price === p.price) return;
    const r = await upsertProduct({ id: p.id, merchant_id: p.merchant_id, name: next.name, price: next.price });
    if (!r.ok) toast(r.error);
    router.refresh();
  };

  const addProduct = async () => {
    const r = await upsertProduct({ merchant_id: merchant.id, ...newProduct, stationId: openingStation });
    if (!r.ok) return toast(r.error);
    setNewProduct({ name: "", price: "", stock: "" });
    router.refresh();
  };

  const removeProduct = async (p: Product) => {
    const r = await deleteProduct(p.id);
    if (!r.ok) return toast(r.error);
    router.refresh();
    toast(`${p.name} removed`, async () => {
      await upsertProduct({ merchant_id: merchant.id, name: p.name, price: p.price, stock: p.stock, stationId: openingStation });
      router.refresh();
    });
  };

  const addArea = async () => {
    if (rates.some((r) => r.area.toLowerCase() === newArea.trim().toLowerCase())) return toast(`${newArea.trim()} is already on the rate card.`);
    const r = await setRate(merchant.id, newArea, newFee);
    if (!r.ok) return toast(r.error);
    toast(`${newArea.trim()} added at ${naira(toNum(newFee))}`);
    setNewArea("");
    setNewFee("");
    setQ("");
    router.refresh();
  };

  const removeArea = async (rate: Rate) => {
    const r = await deleteRate(merchant.id, rate.area);
    if (!r.ok) return toast(r.error);
    router.refresh();
    toast(`${rate.area} removed`, async () => {
      await setRate(merchant.id, rate.area, rate.rider_fee);
      router.refresh();
    });
  };

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Merchant settings</h1>
          <p>{merchant.name}: contact, pickup, products and the delivery rate card.</p>
        </div>
        <span className="spacer" />
        <AddMerchantButton />
      </div>
      <div className="order-layout">
        <div>
          <section className="panel">
            <div className="panel-h">
              <h2>Details</h2>
            </div>
            <div className="panel-b">
              <div className="grid2">
                <div className="field">
                  <label htmlFor="mName">Business name</label>
                  <input className="input" id="mName" value={details.name} onChange={(e) => setDetails({ ...details, name: e.target.value })} />
                </div>
                <div className="field">
                  <label htmlFor="mPhone">WhatsApp number</label>
                  <input className="input" id="mPhone" inputMode="tel" value={details.phone} onChange={(e) => setDetails({ ...details, phone: e.target.value })} />
                </div>
                <div className="field">
                  <label htmlFor="mEmail">Email for remittances</label>
                  <input className="input" id="mEmail" type="email" value={details.email} onChange={(e) => setDetails({ ...details, email: e.target.value })} />
                </div>
                <div className="field">
                  <label htmlFor="mPick">Pickup address</label>
                  <input className="input" id="mPick" value={details.pickup_address} onChange={(e) => setDetails({ ...details, pickup_address: e.target.value })} />
                </div>
                {stations && (
                  <div className="field">
                    <label htmlFor="mStation">Default station</label>
                    <select className="input" id="mStation" value={defaultStationId ?? ""} onChange={(e) => changeDefaultStation(e.target.value)} aria-describedby="mStationHelp">
                      <option value="">None (merchant ships from their own address)</option>
                      {activeStations.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                    <p className="small muted" id="mStationHelp">
                      Preselected on new orders. Saved as soon as you pick.
                    </p>
                  </div>
                )}
              </div>
              <div className="formfoot">
                <button className="btn primary" type="button" onClick={saveDetails}>
                  Save changes
                </button>
              </div>
            </div>
          </section>

          <section className="panel" style={{ marginTop: 20 }}>
            <div className="panel-h">
              <h2>Products</h2>
              <span className="spacer" />
              <span className="small muted">{stations ? "Change stock under Stock by station" : "Stock goes down when an order is marked Delivered"}</span>
            </div>
            <div className="tablewrap">
              <table className="cards">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th className="num">Price</th>
                    <th className="num">Stock</th>
                    <th>
                      <span className="sr">Remove</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr key={p.id}>
                      <td className="first" data-l="Product">
                        <input className="input" aria-label="Product name" defaultValue={p.name} onBlur={(e) => saveProduct(p, { name: e.target.value.trim() || p.name })} />
                      </td>
                      <td data-l="Price">
                        <input className="input num" style={{ width: 120 }} aria-label={`Price of ${p.name}`} inputMode="numeric" defaultValue={p.price} onBlur={(e) => saveProduct(p, { price: toNum(e.target.value) })} />
                      </td>
                      <td data-l="Stock" className="num">
                        {p.stock}
                      </td>
                      <td>
                        <button className="icon-btn" type="button" aria-label={`Remove ${p.name}`} onClick={() => removeProduct(p)}>
                          <Icon name="x" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!products.length && (
                    <tr>
                      <td colSpan={4} className="muted">
                        No products yet. Add the first one below.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="panel-b" style={{ borderTop: "1px solid var(--line)" }}>
              <div className="filters">
                <div className="field" style={{ flex: 1 }}>
                  <label htmlFor="npName">New product</label>
                  <input className="input" id="npName" value={newProduct.name} onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })} />
                </div>
                <div className="field" style={{ minWidth: 110, width: 110 }}>
                  <label htmlFor="npPrice">Price</label>
                  <input className="input" id="npPrice" inputMode="numeric" value={newProduct.price} onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })} />
                </div>
                <div className="field" style={{ minWidth: 90, width: 90 }}>
                  <label htmlFor="npStock">Opening stock</label>
                  <input className="input" id="npStock" inputMode="numeric" value={newProduct.stock} onChange={(e) => setNewProduct({ ...newProduct, stock: e.target.value })} />
                </div>
                <button className="btn" type="button" onClick={addProduct}>
                  Add
                </button>
              </div>
            </div>
          </section>

          {stations ? (
            <>
              <StockPanel products={products} stations={stations} stock={stock} defaultStationId={defaultStationId} />
              <StockHistory moves={moves} stations={stations} people={people} />
            </>
          ) : (
            <p className="small muted" style={{ marginTop: 12 }}>
              To add or move stock between stations, run supabase/migrations/005_stations_and_backup.sql in Supabase.
            </p>
          )}
        </div>

        <div>
          <section className="panel">
            <div className="panel-h">
              <h2>Rate card</h2>
              <span className="spacer" />
              <span className="small muted">{rates.length} areas</span>
            </div>
            <div className="panel-b" style={{ paddingBottom: 8 }}>
              <div className="field">
                <label htmlFor="rateQ" className="sr">
                  Search areas
                </label>
                <input className="input" id="rateQ" type="search" placeholder="Search areas" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
            </div>
            <div className="tablewrap" style={{ maxHeight: 440, overflow: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>Area</th>
                    <th className="num">Rider fee</th>
                    <th className="num">Charged</th>
                    <th>
                      <span className="sr">Remove</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <RateRow key={r.area} rate={r} merchantId={merchant.id} onRemove={() => removeArea(r)} />
                  ))}
                  {!shown.length && (
                    <tr>
                      <td colSpan={4} className="muted">
                        {q ? `No area matches “${q}”.` : "No areas yet."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="panel-b" style={{ borderTop: "1px solid var(--line)" }}>
              <div className="filters">
                <div className="field" style={{ flex: 1 }}>
                  <label htmlFor="newArea">New area</label>
                  <input className="input" id="newArea" placeholder="e.g. Agege" value={newArea} onChange={(e) => setNewArea(e.target.value)} />
                </div>
                <div className="field" style={{ minWidth: 110, width: 110 }}>
                  <label htmlFor="newFee">Rider fee</label>
                  <input className="input" id="newFee" inputMode="numeric" value={newFee} onChange={(e) => setNewFee(e.target.value)} />
                </div>
                <button className="btn" type="button" onClick={addArea}>
                  Add
                </button>
              </div>
            </div>
          </section>
          <section className="panel" style={{ marginTop: 20 }}>
            <div className="panel-h">
              <h2>Markup rule</h2>
              <span className="spacer" />
              <span className="small muted">Read only</span>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Rider fee</th>
                  <th className="num">Markup added</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Under ₦3,000</td>
                  <td className="num">₦2,000</td>
                </tr>
                <tr>
                  <td>₦3,000 to ₦4,999</td>
                  <td className="num">₦1,500</td>
                </tr>
                <tr>
                  <td>₦5,000 and over</td>
                  <td className="num">₦1,000</td>
                </tr>
              </tbody>
            </table>
          </section>
        </div>
      </div>
    </>
  );
}

function RateRow({ rate, merchantId, onRemove }: { rate: Rate; merchantId: string; onRemove: () => void }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [fee, setFee] = useState(String(rate.rider_fee));
  const save = async () => {
    const n = toNum(fee);
    if (n === rate.rider_fee) return;
    const r = await setRate(merchantId, rate.area, n);
    if (!r.ok) {
      setFee(String(rate.rider_fee));
      return toast(r.error);
    }
    router.refresh();
  };
  return (
    <tr>
      <td>{rate.area}</td>
      <td className="num">
        <input className="input num" style={{ width: 100 }} aria-label={`Rider fee for ${rate.area}`} inputMode="numeric" value={fee} onChange={(e) => setFee(e.target.value)} onBlur={save} />
      </td>
      <td className="num">{naira(charged(toNum(fee)))}</td>
      <td>
        <button className="icon-btn" type="button" aria-label={`Remove ${rate.area}`} onClick={onRemove}>
          <Icon name="x" />
        </button>
      </td>
    </tr>
  );
}
