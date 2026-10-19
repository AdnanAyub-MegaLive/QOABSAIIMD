"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./store";
import GameIcon from "./game-icon";
import { rocketMultiplierCents, rocketMaxMultiplier } from "@/lib/game-control/rocket.mjs";
import { outcomeOddsText } from "@/lib/game-control/outcome-weights.mjs";
import styles from "./rocket-player.module.css";
const coins = value => BigInt(value ?? 0).toLocaleString();
export default function RocketPlayer({ gameId, preview = false }) {
  const request = useCallback(body => preview ? api("admin", { action: "preview-round", request: { ...body, gameId } }) : api("player", { ...body, gameId }), [preview, gameId]);
  const [state, setState] = useState(null), [now, setNow] = useState(0), [amount, setAmount] = useState(100);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [pending, setPending] = useState(null), [help, setHelp] = useState(false);
  const offset = useRef(0), received = useRef(0), inflight = useRef(null), guard = useRef(false), round = useRef(""), dialog = useRef(null);
  const load = useCallback(() => {
    if (inflight.current) return inflight.current;
    inflight.current = request({ action: "shared-state" }).then(s => {
      received.current = Date.now(); offset.current = s.serverTime - received.current; setNow(s.serverTime); setState(s);
      const key = `${s.dayId}:${s.slot}`;
      if (round.current !== key) { round.current = key; setPending(null); setError(""); }
      setPending(p => p && (s.mineEntries || []).some(e => e.id === p.id) ? null : p);
    }).finally(() => { inflight.current = null; });
    return inflight.current;
  }, [request]);
  useEffect(() => {
    let active = true;
    const poll = () => { if (!document.hidden) load().catch(e => { if (active) setError(e.message); }); };
    poll(); const timer = setInterval(poll, 500), tick = setInterval(() => setNow(Date.now() + offset.current), 50);
    document.addEventListener("visibilitychange", poll);
    return () => { active = false; clearInterval(timer); clearInterval(tick); document.removeEventListener("visibilitychange", poll); };
  }, [load]);
  useEffect(() => { if (help) dialog.current?.showModal(); else dialog.current?.close(); }, [help]);
  const game = state?.game, mine = state?.mineEntries?.[0], result = mine?.result;
  const maxMultiplier = rocketMaxMultiplier(game);
  const stale = !state || now - state.serverTime > 2000;
  const sameRound = !!state && now < state.endsAt;
  const boarding = sameRound && now < state.closesAt;
  const crashed = !!state?.rocket?.crashed;
  const flying = sameRound && now >= state.closesAt && now < state.revealsAt && !crashed;
  const cash = result?.cashedOut;
  const multiplier = !state || boarding ? 0 : crashed ? state.rocket.multiplier : rocketMultiplierCents(state.closesAt, state.revealsAt - state.closesAt, now, maxMultiplier) / 100;
  const balance = state?.availableCoins ?? state?.availablePoints ?? "0";
  const stake = Number(mine?.amount ?? amount), estimated = Math.floor(stake * Math.round(multiplier * 100) / 100);
  const seconds = state ? Math.max(0, Math.ceil(((boarding ? state.closesAt : state.phase === "reset" ? state.resetAt : state.endsAt) - now) / 1000)) : 0;
  const canBoard = boarding && state.acceptingBets !== false && !mine && !stale && Number.isSafeInteger(amount) && amount >= game.minBet && amount <= game.maxBet && BigInt(amount) <= BigInt(balance);
  const canCash = flying && mine?.status === "PENDING" && !stale;
  async function action() {
    if (guard.current || !state) return;
    guard.current = true; setBusy(true); setError("");
    const payload = pending || (canCash ? { action: "shared-cashout", id: mine.id } : { action: "shared-enter", id: crypto.randomUUID(), dayId: state.dayId, slot: state.slot, amount, choice: "board" });
    try {
      if (payload.action === "shared-enter") setPending(payload);
      await request(payload); setPending(null);
      if (inflight.current) await inflight.current.catch(() => {});
      await load();
    } catch (e) { if (e.status && e.status < 500) setPending(null); setError(e.message); }
    finally { guard.current = false; setBusy(false); }
  }
  async function refill() {
    if (guard.current) return; guard.current = true; setBusy(true);
    try { await request({ action: "refill" }); if (inflight.current) await inflight.current.catch(() => {}); await load(); setError(""); }
    catch (e) { setError(e.message); } finally { guard.current = false; setBusy(false); }
  }
  const t = multiplier / maxMultiplier, x = 18 + 66 * t, y = 70 - 54 * t * t;
  let path = "M 61.2 154";
  for (let i = 1; i <= 40; i++) { const q = t * i / 40; path += ` L ${(18 + 66 * q) * 3.4} ${(70 - 54 * q * q) * 2.2}`; }
  return <div className={styles.shell}>
    <div className={styles.context}><span>MEGA LIVE · {preview ? "ADMIN PREVIEW" : "SHARED ROOM"}</span><h2>{preview ? "Ready for takeoff?" : "One room. One flight."}</h2><p>{preview ? "Practice coins · No wallet changes" : `${state?.participants ?? 0} players aboard · Application coin wallet`}</p><small>{state?.roomId ?? "Connecting to the game…"}</small></div>
    <section className={styles.game} aria-label="Rocket shared room game">
      <header className={styles.header}><div><GameIcon engine="rocket" size={30}/><strong>ROCKET</strong><span>MAX {maxMultiplier}×</span></div><button onClick={() => setHelp(true)} aria-label="Rocket rules and probabilities">?</button></header>
      <div className={styles.history} aria-label="Previous flights">{state?.history?.length ? state.history.slice(0, 5).map(h => <span key={h.roundNumber} className={h.crashCents >= 300 ? styles.high : ""}>{h.result}</span>) : <small>Flight history appears after the first round</small>}<small>{preview ? "PRACTICE" : "RECENT"}</small></div>
      <div className={`${styles.flight} ${crashed ? styles.crashed : ""}`}>
        <div className={styles.flightTop}><span>{stale ? "CONNECTING…" : boarding ? "● BOARDING OPEN" : crashed ? "● ROCKET CRASHED" : flying ? "● ROCKET IN FLIGHT" : "WAITING FOR NEXT FLIGHT"}</span><small>#{String(state?.roundNumber ?? 0).padStart(4, "0")}</small></div>
        <div className={styles.multiplier}><strong>{multiplier.toFixed(2)}<span>×</span></strong><small>{cash ? "Your return is safely locked in" : crashed ? "Flight ended. Next one soon." : boarding ? "Next stop: the stars" : `Climbing toward ${maxMultiplier.toFixed(2)}×`}</small></div>
        <svg className={styles.scene} viewBox="0 0 340 220" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="rocketTrailFill" x1="0" x2="0" y1="0" y2="1"><stop stopColor="#55d9b1" stopOpacity=".18"/><stop offset="1" stopColor="#55d9b1" stopOpacity="0"/></linearGradient></defs><path d="M30 180H305M30 125H305M30 70H305" stroke="#294052" strokeWidth=".7" strokeDasharray="2 5"/>{!boarding && <><path d={`${path} L ${x * 3.4} 190 L 61.2 190 Z`} fill="url(#rocketTrailFill)"/><path className={styles.trail} d={path}/></>}</svg>
        {!crashed && <div className={styles.rocket} style={{ left: `${x}%`, top: `${y}%`, transform: `translate(-50%,-50%) rotate(${boarding ? 0 : 65 - 50 * t}deg)` }}><svg viewBox="0 0 60 110" aria-hidden="true"><defs><linearGradient id="rocketBody"><stop stopColor="#b7d2e1"/><stop offset=".48" stopColor="#fff9e7"/><stop offset="1" stopColor="#88b8bc"/></linearGradient></defs>{flying && <g className={styles.fire}><path d="M22 76Q19 93 30 108Q42 91 38 76" fill="#ff9357"/><path d="M26 76Q23 92 30 101Q36 91 34 76" fill="#ffda82"/></g>}<path d="M18 52Q3 62 6 82L21 73M42 52Q57 62 54 82L39 73" fill="#70e3bd"/><path d="M18 72C13 46 15 22 30 5C45 22 47 46 42 72Z" fill="url(#rocketBody)"/><path d="M20 19Q25 10 30 5Q35 10 40 19Z" fill="#78ebc4"/><circle cx="30" cy="39" r="10" fill="#203f55" stroke="#7adbbd" strokeWidth="3"/><circle cx="28" cy="36" r="4" fill="#6892a1"/><path d="M20 70H40L37 80H23Z" fill="#344d5d"/></svg></div>}
        <div className={styles.altitude}><span>{maxMultiplier}×</span><span>{(maxMultiplier * .6).toFixed(1)}×</span><span>{(maxMultiplier * .2).toFixed(1)}×</span></div>
        <div className={styles.flightStatus}><span>{cash ? `Exited at ${result.cashoutMultiplier.toFixed(2)}×` : boarding ? mine ? "You’re aboard. Get ready." : "Board before the countdown ends" : crashed ? mine ? "Boarding coins lost" : "Next flight opens soon" : mine ? "Choose your exit" : "Board the next flight"}</span><b>{cash ? "CASHED OUT" : boarding ? `LAUNCH IN ${seconds}s` : flying ? "LIVE FLIGHT" : `NEXT IN ${seconds}s`}</b></div>
      </div>
      <div className={styles.stats}><div><small>{mine ? "YOUR BOARDED COINS" : "YOUR BOARDING AMOUNT"}</small><strong>◈ {Number.isSafeInteger(stake) && stake >= 0 ? coins(stake) : "—"}</strong></div><div><small>{cash ? "CASHED OUT · COINS" : mine && flying ? "CASH-OUT ESTIMATE · COINS" : "WALLET · COINS"}</small><strong className={cash || mine && flying ? styles.gain : ""}>{coins(cash ? result.payout : mine && flying ? estimated : balance)}</strong></div></div>
      <div className={styles.amounts}><label>COINS<input type="number" aria-label="Boarding coins" min={game?.minBet ?? 1} max={game?.maxBet ?? 10000} step={1} value={amount} disabled={!boarding || !!mine || busy || !!pending} onChange={e => setAmount(Number(e.target.value))}/></label>{[100, 500, 1000].map(n => <button key={n} disabled={!boarding || !!mine || busy || !!pending || n < game?.minBet || n > game?.maxBet} onClick={() => setAmount(n)}>{n === 1000 ? "1K" : n}</button>)}</div>
      <div className={styles.bottom}>
        <button className={styles.action} disabled={busy || (!pending && !canBoard && !canCash)} onClick={action}><span><strong>{busy ? "Confirming…" : pending ? "Retry boarding" : cash ? "Cashed out successfully" : canCash ? "Cash out now" : boarding ? mine ? "You’re on board" : state?.acceptingBets === false ? "Boarding paused" : "Get on board" : crashed ? "Rocket crashed" : "Boarding closed"}</strong><small>{cash ? `Locked at ${result.cashoutMultiplier.toFixed(2)}×` : canCash ? "Server confirms your return on receipt" : boarding ? `Launching in ${seconds}s` : `Next flight in ${seconds}s`}</small></span><b>{cash ? coins(result.payout) : canCash ? coins(estimated) : boarding ? (Number.isSafeInteger(stake) && stake >= 0 ? coins(stake) : "—") : "—"} ◈</b></button>
        <p>Crash possible at 0–{maxMultiplier}× · Below 1× returns less than your stake</p>
      </div>
      {error && <div className={styles.error} role="alert"><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError("")}>×</button></div>}
      <dialog ref={dialog} className={styles.help} onClose={() => setHelp(false)}><header><h2>Rocket rules</h2><button onClick={() => setHelp(false)}>Close</button></header><p>Board before launch. One boarding entry per player per flight. The multiplier starts at 0× and can crash at any 0.01× level through {maxMultiplier}×. Cash out before the crash. Still aboard at the crash means zero coins returned. No automatic payout at the maximum.</p><p>Below 1× returns less than your stake. Your cash-out is confirmed using the server time when the request is accepted; network latency can change the return from the displayed estimate. A request at or after the crash is too late.</p><p>An early crash stays visible until the next scheduled boarding window. Settings apply at the next UTC daily reset; saved previews update immediately.</p><p>{game && outcomeOddsText(game)}</p><p>Wallet: {coins(balance)} {preview ? "practice coins" : "application coins"}.</p>{preview && <button disabled={busy || !!pending} onClick={refill}>Refill practice coins</button>}<h3>Recent entries</h3>{state?.recentEntries?.map(e => <p key={e.id}>{e.result?.result || "Aboard"} · {coins(e.result?.payout ?? 0)} returned</p>)}</dialog>
    </section>
  </div>;
}
