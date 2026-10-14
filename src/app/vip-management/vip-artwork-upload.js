"use client";
import { useState } from "react";
import { SVGA_CATEGORIES } from "@/lib/svga-policy";

export default function VipArtworkUpload({ privilege, canUpload, onUploaded, onBusy }) {
  const [file, setFile] = useState(null), [poster, setPoster] = useState(null);
  const [price, setPrice] = useState(""), [senderXp, setSenderXp] = useState(""), [receiverXp, setReceiverXp] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function upload() {
    if (!file) return;
    setBusy(true); onBusy(true); setError("");
    try {
      const form = new FormData();
      form.set("name", `${privilege.label} — ${file.name}`.slice(0, 80));
      form.set("category", privilege.category); form.set("distribution", "MANUAL");
      form.set("storeVisible", "false"); form.set("file", file);
      if (poster) form.set("posterFile", poster);
      if (privilege.category === "GIFTS") {
        form.set("giftTier", "VIP"); form.set("giftCategory", "VIP");
        form.set("coinPrice", price); form.set("senderXp", senderXp); form.set("receiverXp", receiverXp);
      }
      const response = await fetch("/api/uploads", { method: "POST", body: form });
      const text = await response.text();
      let body; try { body = JSON.parse(text); } catch { throw new Error(`Upload failed (${response.status}). Check the file size or server connection.`); }
      if (!response.ok || !body.success) throw new Error(body.error?.message || "Artwork upload failed.");
      await onUploaded(body.data.asset.id);
      setFile(null); setPoster(null);
    } catch (e) { setError(e.message); } finally { setBusy(false); onBusy(false); }
  }
  const input = "mt-1 block w-full rounded-lg border border-[#dce8e5] bg-white p-2 text-xs";
  return <details className="mt-3 text-xs"><summary className="cursor-pointer font-semibold text-[#16877d]">Upload new artwork here</summary>
    <p className="mt-2 text-[#71847f]">Included artwork expires with the VIP membership. No separate duration is required.</p>
    <label className="mt-3 block">Artwork<input className={input} type="file" disabled={!canUpload || busy} accept={`image/png,image/jpeg,image/webp,image/gif,video/mp4${SVGA_CATEGORIES.has(privilege.category) ? ",.svga,application/svga" : ""}`} onChange={e => setFile(e.target.files?.[0] ?? null)}/></label>
    <label className="mt-2 block">Poster (optional for SVGA; required where applicable for video)<input className={input} type="file" disabled={!canUpload || busy} accept="image/png,image/jpeg,image/webp" onChange={e => setPoster(e.target.files?.[0] ?? null)}/></label>
    {privilege.category === "GIFTS" && <div className="mt-2 grid gap-2">{[["Gift price in Coins",price,setPrice],["Sender XP",senderXp,setSenderXp],["Receiver XP",receiverXp,setReceiverXp]].map(([label,value,set]) => <label key={label}>{label}<input className={input} type="number" min="0" step="1" value={value} onChange={e => set(e.target.value)}/></label>)}</div>}
    <button type="button" disabled={!canUpload || busy || !file || (privilege.category === "GIFTS" && [price,senderXp,receiverXp].some(v => v === ""))} onClick={upload} className="mt-3 rounded-lg bg-[#16877d] px-3 py-2 font-semibold text-white disabled:opacity-50">{busy ? "Uploading…" : "Upload & select"}</button>
    {!canUpload && <p className="mt-2">Uploads permission is required.</p>}
    {error && <p role="alert" className="mt-2 text-red-700">{error}</p>}
  </details>;
}
