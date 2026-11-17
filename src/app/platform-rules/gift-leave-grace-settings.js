"use client";
import { useEffect, useState } from "react";

export default function GiftLeaveGraceSettings({ canManage }) {
  const [enabled, setEnabled] = useState(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    fetch("/api/admin/gift-leave-grace").then(async (r) => { const j = await r.json(); if (!r.ok) throw Error(j.error?.message); return j.data; })
      .then((next) => { if (active) setEnabled(next.enabled); }).catch((e) => { if (active) setMessage(e.message); });
    return () => { active = false; };
  }, []);
  const save = async (next) => {
    setBusy(true); setMessage("");
    try {
      const r = await fetch("/api/admin/gift-leave-grace", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled: next }) });
      const j = await r.json(); if (!r.ok) throw Error(j.error?.message);
      setEnabled(j.data.enabled); setMessage("Saved.");
    } catch (e) { setMessage(e.message); } finally { setBusy(false); }
  };
  return <section className="mt-6 portal-panel rounded-2xl border border-[#dce8e5] bg-white p-6">
    <h3 className="text-lg font-bold">Finish gifts after leaving room</h3>
    <p className="my-3 text-sm text-[#71847f]">When on, gifts tapped while the sender was in the room are still settled for up to 2 minutes after the sender leaves or loses connection. These late gifts are charged and paid normally but do not replay the animation in the room. Expired lucky bags are also refunded automatically every minute, even in empty rooms.</p>
    {enabled === null ? <p className="text-sm text-[#71847f]">{message || "Loading…"}</p> :
      <label className="flex items-center gap-3 text-sm font-semibold"><input type="checkbox" className="h-5 w-5" disabled={!canManage || busy} checked={enabled} onChange={(e) => save(e.target.checked)} />{enabled ? "On" : "Off"}</label>}
    {enabled !== null && message && <p className="mt-3 text-sm text-[#71847f]">{message}</p>}
  </section>;
}
