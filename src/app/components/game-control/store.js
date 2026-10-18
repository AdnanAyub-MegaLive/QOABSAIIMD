"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { resolveRoulette } from "@/lib/game-control/roulette/engine.mjs";
import { validateGame, resolveRound } from "@/lib/game-control/rules.mjs";
import { miniGames, resolveMini } from "@/lib/game-control/mini-games.mjs";
import { dealTeenPatti } from "@/lib/game-control/teen-patti.mjs";
const Context = createContext(null);
export async function api(surface, body) {
  const response = await fetch(`/api/games/${surface}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  let data;
  try { data = await response.json(); } catch { throw new Error("The server could not complete this request."); }
  if (!response.ok) { const error = new Error(data.error || "Request failed."); error.status = response.status; throw error; }
  return data;
}
export function Store({ children, preview = false, previewGames = [] }) {
  const [data, setData] = useState(() => ({ games: preview ? previewGames.map((g) => ({ ...g, status: "active" })) : [], rounds: [], audit: [], balance: 10000 }));
  const [authenticated, setAuthenticated] = useState(preview);
  const [loading, setLoading] = useState(!preview);
  const [error, setError] = useState("");
  const stateRef = useRef(data);
  useEffect(() => { stateRef.current = data; }, [data]);
  const refresh = useCallback(async () => {
    if (preview) return;
    try {
      const value = await api("admin", { action: "snapshot" });
      setData(value); setAuthenticated(true); setError("");
    } catch (e) {
      if (e.status === 401) setAuthenticated(false);
      setError(e.message);
    } finally { setLoading(false); }
  }, [preview]);
  useEffect(() => {
    if (!preview && location.pathname.startsWith("/games-management")) {
      const timer = setTimeout(refresh, 0);
      return () => clearTimeout(timer);
    }
  }, [preview, refresh]);
  async function saveGame(input) {
    const game = validateGame(input);
    const result = await api("admin", { action: "saveGame", game: { ...game, revision: input.revision } });
    setData((prev) => ({ ...prev, games: prev.games.some((g) => g.id === game.id) ? prev.games.map((g) => g.id === game.id ? result.game : g) : [...prev.games, result.game], audit: [result.audit, ...prev.audit] }));
    return result.game;
  }
  function demoBet(gameId, bet, choice, bets, challenge) {
    if (!preview) throw new Error("Practice mode is disabled.");
    const current = stateRef.current;
    const game = current.games.find((g) => g.id === gameId);
    if (!game) throw new Error("Game not found.");
    if (bet > current.balance) throw new Error("Not enough practice coins.");
    const result = miniGames[game.engine] ? resolveMini(game, bet, choice, randomDraw(120000), challenge, Date.now(), game.engine==="teenpatti"?dealTeenPatti(randomDraw):undefined) : game.engine === "roulette" ? resolveRoulette(game, bets, randomDraw(game.pocketWeights.reduce((s, w) => s + w, 0))) : resolveRound(game, bet, choice, randomDraw(10000));
    const round = { id: crypto.randomUUID(), uid: "practice-player", nickname: "Practice Player", roomId: "practice-room", gameId, gameName: game.name, ...result, status: "settled", createdAt: new Date().toISOString(), demo: true };
    const next = { ...current, balance: current.balance - round.bet + round.payout, rounds: [round, ...current.rounds] };
    stateRef.current = next; setData(next); return round;
  }
  async function loadOlder() {
    if (!data.rounds.length) return;
    const last = data.rounds[data.rounds.length - 1];
    const result = await api("admin", { action: "olderRounds", before: last.createdAt, beforeId: last.id });
    setData((prev) => ({ ...prev, rounds: [...prev.rounds, ...result.rounds.filter((r) => !prev.rounds.some((old) => old.id === r.id))] }));
  }
  function refillDemo() {
    const next = { ...stateRef.current, balance: Math.max(10000, stateRef.current.balance) };
    stateRef.current = next; setData(next);
  }
  return <Context.Provider value={{ isDemo: preview, data, authenticated, loading, error, refresh, saveGame, demoBet, refillDemo, loadOlder }}>{children}</Context.Provider>;
}
function randomDraw(max) {
  const bound = Math.floor(4294967296 / max) * max;
  let n;
  do { n = crypto.getRandomValues(new Uint32Array(1))[0]; } while (n >= bound);
  return n % max;
}
export function useStore() { return useContext(Context); }
