"use client";
import { useCallback, useEffect, useState } from "react";

export default function TulasiGames({ canManage = true }) {
  const [state, setState] = useState({ loading: true, configured: false, games: [] });
  const [error, setError] = useState(""), [busy, setBusy] = useState(null);
  const load = useCallback(async () => {
    const response = await fetch("/api/admin/tulasi-games", { cache: "no-store" });
    const json = await response.json();
    if (!response.ok) throw new Error(json.error?.message || "Unable to load provider games.");
    return json.data;
  }, []);
  useEffect(() => { let on = true; load().then((d) => on && setState({ loading: false, ...d })).catch((e) => on && (setError(e.message), setState((s) => ({ ...s, loading: false })))); return () => { on = false; }; }, [load]);
  async function patch(gameId, change) {
    setBusy(gameId); setError("");
    try {
      const response = await fetch("/api/admin/tulasi-games", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ gameId, ...change }) });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error?.message || "Unable to save.");
      setState((s) => ({ ...s, games: s.games.map((g) => g.gameId === gameId ? { ...g, ...json.data } : g) }));
    } catch (e) { setError(e.message); } finally { setBusy(null); }
  }
  return (
    <section className="mt-8 rounded-2xl border border-[#dce7e4] bg-white p-6">
      <h2 className="text-lg font-bold">Tulasi provider games</h2>
      <p className="mt-1 text-sm text-[#71847f]">Games are synced from the Tulasi admin panel (Basic Configuration → Sync Game List). Turn a game on to show it in live rooms. Bets and wins use real coin balances.</p>
      {!state.configured && !state.loading && <p className="mt-3 rounded-xl bg-[#fff4e5] p-3 text-sm">Tulasi keys are not set on the server (TULASI_MERCHANT_ID, TULASI_PLATFORM_PUBLIC_KEY, TULASI_MERCHANT_PRIVATE_KEY).</p>}
      {error && <p className="mt-3 rounded-xl bg-[#fdecec] p-3 text-sm text-[#a12a2a]">{error}</p>}
      {state.loading ? <p className="mt-4 text-sm">Loading…</p> : !state.games.length ? <p className="mt-4 text-sm text-[#71847f]">No games synced yet.</p> : (
        <table className="mt-4 w-full text-left text-sm">
          <thead><tr className="text-[#71847f]"><th className="py-2">Game</th><th>ID</th><th>Provider</th><th>Order</th><th>Show in rooms</th></tr></thead>
          <tbody>{state.games.map((g) => (
            <tr key={g.gameId} className="border-t border-[#eef3f2]">
              <td className="py-2"><div className="flex items-center gap-2">{g.image && <img src={g.image} alt="" className="h-8 w-8 rounded-lg" />}<span>{g.name}<br /><span className="text-xs text-[#71847f]">{g.identification}</span></span></div></td>
              <td>{g.gameId}</td>
              <td>{g.providerStatus === 1 ? "Enabled" : "Disabled"}</td>
              <td><input type="number" min="0" max="9999" defaultValue={g.sortOrder} disabled={!canManage || busy === g.gameId} className="w-20 rounded-lg border border-[#dce7e4] px-2 py-1" onBlur={(e) => { const v = Number(e.target.value); if (Number.isSafeInteger(v) && v !== g.sortOrder) patch(g.gameId, { sortOrder: v }); }} /></td>
              <td><input type="checkbox" checked={g.enabled} disabled={!canManage || busy === g.gameId || g.providerStatus !== 1} onChange={(e) => patch(g.gameId, { enabled: e.target.checked })} /></td>
            </tr>))}</tbody>
        </table>)}
    </section>
  );
}
