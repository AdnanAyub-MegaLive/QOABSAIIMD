"use client";
import { useState } from "react";
import { configureSpecialIdStore } from "./special-id-store-actions";
export default function SpecialIdStoreSettings({ item, onSaved }) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  if (!open) return <button type="button" className="rounded border px-3 py-2 text-xs" onClick={() => setOpen(true)}>Store settings</button>;
  return <form className="grid gap-2 rounded border p-3 text-left" onSubmit={async e => {
    e.preventDefault(); const data = new FormData(e.currentTarget); setBusy(true); setError("");
    try {
      const result = await configureSpecialIdStore(item.id, data.get("price"), data.get("duration"), data.get("visible") === "on");
      if (!result.success) throw Error(result.message);
      onSaved({ ...item, coinPrice: data.get("price"), defaultDurationMinutes: Number(data.get("duration")), storeVisible: data.get("visible") === "on" }); setOpen(false);
    } catch (e) { setError(e.message || "Unable to save settings."); } finally { setBusy(false); }
  }}>
    <label>Coin price<input name="price" className="block w-36 rounded border p-2" inputMode="numeric" pattern="[0-9]+" required defaultValue={item.coinPrice || ""}/></label>
    <label>Duration (minutes)<input name="duration" className="block w-36 rounded border p-2" type="number" min="1" max="52560000" required defaultValue={item.defaultDurationMinutes}/></label>
    <label><input type="checkbox" name="visible" defaultChecked={item.storeVisible}/> Available for purchase</label>
    <p>Replaces the buyer’s current Special ID.</p>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    <button disabled={busy} type="submit">Save</button><button type="button" onClick={() => setOpen(false)}>Cancel</button>
  </form>;
}
