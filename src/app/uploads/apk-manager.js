"use client";
import { useEffect, useState } from "react";
import { readApkResponse } from "@/lib/apk-response";

export default function ApkManager({ canManage = false }) {
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  async function request(options) {
    const response = await fetch("/api/admin/apks", options);
    return readApkResponse(response);
  }
  useEffect(() => {
    request().then(result => setItems(result.data.items)).catch(error => setMessage(error.message)).finally(() => setLoading(false));
  }, []);
  async function upload(event) {
    event.preventDefault(); const form = event.currentTarget;
    setBusy(true); setMessage("");
    try {
      const result = await request({ method: "POST", body: new FormData(form) });
      setItems(current => [result.data.item, ...current]); form.reset(); setMessage("APK uploaded. Copy its public link below.");
    } catch (error) { setMessage(error.message); } finally { setBusy(false); }
  }
  async function toggle(item) {
    setBusy(true); setMessage("");
    try {
      await request({ method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, active: !item.active }) });
      setItems(current => current.map(row => row.id === item.id ? { ...row, active: !row.active } : row));
    } catch (error) { setMessage(error.message); } finally { setBusy(false); }
  }
  return <section className="space-y-5" role="tabpanel">
    <div><h3 className="text-lg font-bold">Android APK downloads</h3><p className="mt-1 text-sm text-[#71847f]">Upload a signed release APK (maximum 250 MB). Anyone with an active link can download without signing in. Only upload builds you trust.</p></div>
    {canManage && <form onSubmit={upload} className="flex flex-wrap items-end gap-4 rounded-xl border border-[#dce7e4] bg-white p-5">
      <label className="flex-1 text-sm font-semibold">Release name<input name="name" required maxLength={150} placeholder="MegaLive Android v1.0" className="mt-2 block w-full rounded-lg border p-2" /></label>
      <label className="text-sm font-semibold">APK file<input name="file" type="file" accept=".apk,application/vnd.android.package-archive" required className="mt-2 block max-w-72 text-sm" /></label>
      <button disabled={busy} className="rounded-lg bg-[#087f74] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">{busy ? "Please wait…" : "Upload APK"}</button>
    </form>}
    {message && <p role="status" className="rounded-lg border bg-white p-3 text-sm">{message}</p>}
    {loading ? <p>Loading APKs…</p> : !items.length ? <p className="rounded-xl border bg-white p-8 text-center text-[#71847f]">No APK releases uploaded yet.</p> : items.map(item => <article key={item.id} className="rounded-xl border border-[#dce7e4] bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h4 className="font-bold">{item.name}</h4><p className="mt-1 text-xs text-[#71847f]">{(item.fileSize / 1048576).toFixed(1)} MB · {new Date(item.createdAt).toLocaleDateString()} · {item.active ? "Public download enabled" : "Disabled"}</p></div>
        {canManage && <button disabled={busy} onClick={() => toggle(item)} className="rounded-lg border px-4 py-2 text-sm">{item.active ? "Disable link" : "Enable link"}</button>}</div>
      <div className="mt-4 flex flex-wrap items-center gap-3"><a href={item.downloadPath} className="break-all text-sm text-[#087f74]">Download APK</a><button disabled={!item.active} className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50" onClick={async () => { try { await navigator.clipboard.writeText(new URL(item.downloadPath, window.location.origin).href); setMessage("Public download link copied."); } catch { setMessage(`Copy this link: ${new URL(item.downloadPath, window.location.origin).href}`); } }}>Copy public link</button></div>
    </article>)}
  </section>;
}
