"use client";
import { useCallback, useEffect, useState } from "react";

const empty = { name: "", launchUrl: "", status: "paused", sortOrder: 0, engine: "external" };
const input = "mt-2 w-full rounded-xl border border-[#dce7e4] bg-white px-3 py-2 text-sm disabled:bg-[#f4f8f7] disabled:text-[#71847f]";
export default function RoomGames() {
  const [games, setGames] = useState([]), [draft, setDraft] = useState(empty);
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    const response = await fetch("/api/admin/room-games", { cache: "no-store" });
    const json = await response.json();
    if (!response.ok) throw new Error(json.error?.message || "Unable to load games.");
    setGames(json.data.games);
  }, []);
  useEffect(() => { load().catch(e => setError(e.message)).finally(() => setLoading(false)); }, [load]);
  async function save(event) {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/room-games", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error?.message || "Unable to save game.");
      setDraft(empty); await load(); setNotice("Game saved. The mobile catalogue will use this setting on its next refresh.");
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  }
  return <div className="space-y-6">
    <div><h2 className="text-2xl font-bold tracking-tight">Game catalogue</h2><p className="mt-1.5 text-sm text-[#71847f]">Add a game link and enable visibility to show it in the mobile room game catalogue. These settings apply to all rooms.</p></div>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    <form onSubmit={save} className="space-y-4 rounded-2xl border border-[#dce7e4] bg-white p-6">
      <h3 className="font-semibold">{draft.id ? "Edit game" : "Add game link"}</h3>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium">Game name<input className={input} required minLength={2} maxLength={60} value={draft.name} disabled={saving} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
        <label className="text-sm font-medium">Game link<input className={input} type="url" required maxLength={2048} placeholder="https://games.example.com/play" value={draft.launchUrl} disabled={saving || draft.engine !== "external"} onChange={e => setDraft({ ...draft, launchUrl: e.target.value })} /></label>
        <label className="text-sm font-medium">Display order<input className={input} type="number" min={0} max={100000} step={1} required value={draft.sortOrder ?? 0} disabled={saving} onChange={e => setDraft({ ...draft, sortOrder: Number(e.target.value) })} /></label>
        <label className="text-sm font-medium">Mobile visibility<select className={input} value={draft.status} disabled={saving} onChange={e => setDraft({ ...draft, status: e.target.value })}><option value="paused">Hidden</option><option value="active">Visible</option></select></label>
      </div>
      <p className="text-xs text-[#71847f]">Linked games open at the supplied address. Portal-hosted game links are generated automatically. External games have no automatic access to portal accounts or wallets.</p>
      <div className="flex gap-3"><button disabled={saving} className="rounded-lg bg-[#087f74] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : "Save game"}</button>{draft.id && <button type="button" disabled={saving} onClick={() => setDraft(empty)} className="px-4 text-sm">Cancel</button>}</div>
    </form>
    <div className="overflow-x-auto rounded-2xl border border-[#dce7e4] bg-white"><table className="w-full text-left text-sm"><thead className="bg-[#edf5f2] text-[#57716a]"><tr>{["Order", "Game", "Link", "Visibility", ""].map((label, i) => <th key={i} className="p-4">{label}</th>)}</tr></thead><tbody>
      {games.map(game => <tr key={game.id} className="border-t border-[#edf2f0]"><td className="p-4">{game.sortOrder ?? 0}</td><td className="p-4 font-medium">{game.name}<p className="text-xs font-normal text-[#71847f]">{game.engine === "external" ? "Linked game" : "Portal game"}</p></td><td className="max-w-xs break-all p-4 text-xs">{game.launchUrl}{game.invalidLink && <p className="text-red-700">Update this link before publishing.</p>}</td><td className="p-4">{game.status === "active" ? "Visible" : "Hidden"}</td><td className="p-4"><button disabled={saving} onClick={() => { setDraft(game); setNotice(""); }} className="font-semibold text-[#087f74]">Edit</button></td></tr>)}
      {!games.length && <tr><td colSpan={5} className="p-8 text-center text-[#71847f]">{loading ? "Loading games…" : "No games yet. Add your first game link above."}</td></tr>}
    </tbody></table></div>
  </div>;
}
