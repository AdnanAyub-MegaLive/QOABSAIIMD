"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft,
  FlaskConical,
  ShieldCheck,
  RotateCw,
  Coins,
  AlertCircle,
} from "lucide-react";
import { useStore, api } from "./store";
import { markets, resultColor } from "@/lib/game-control/roulette/engine.mjs";
import {
  chips,
  isBetWinner,
  wheelOrder,
} from "@/lib/game-control/roulette/original-rules.mjs";
import { formatCoins as fmt } from "@/lib/game-control/demo";
export default function RoulettePlayer({
  game,
  user,
  room,
  live,
  refreshProfile,
}) {
  const { isDemo, demoBet } = useStore();
  const [bets, setBets] = useState({}),
    [chip, setChip] = useState(25),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState(null),
    [error, setError] = useState(""),
    [pending, setPending] = useState(null),
    [rotation, setRotation] = useState(0);
  const guard = useRef(false);
  const total = Object.values(bets).reduce((s, v) => s + v, 0),
    weights = game.pocketWeights,
    weightSum = weights.reduce((s, w) => s + w, 0);
  function add(label) {
    if (busy || pending) return;
    setError("");
    if (total + chip > game.maxBet || total + chip > user.availableCoins) {
      setError("This chip exceeds your balance or the game’s total bet limit.");
      return;
    }
    setBets((p) => ({ ...p, [label]: (p[label] || 0) + chip }));
  }
  async function reveal(r) {
    if (r.status !== "settled") {
      setResult(r);
      return;
    }
    const normalized = ((rotation % 360) + 360) % 360;
    const target = (360 - (wheelOrder.indexOf(r.result) * 360) / 37) % 360;
    setRotation(rotation + 1080 + ((target - normalized + 360) % 360));
    await new Promise((resolve) => setTimeout(resolve, 1400));
    setResult(r);
    setBets({});
    setPending(null);
  }
  async function spin() {
    if (guard.current) return;
    guard.current = true;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      if (isDemo) {
        const r = demoBet(game.id, total, "roulette", bets);
        await reveal(r);
      } else {
        const id = crypto.randomUUID();
        setPending(id);
        const { round } = await api("player", {
          action: "bet",
          id,
          gameId: game.id,
          bet: total,
          bets,
          revision: game.revision,
        });
        await reveal(round);
        await refreshProfile();
      }
    } catch (e) {
      setError(
        e.message +
          (isDemo
            ? ""
            : " Check the pending round before submitting another bet."),
      );
    } finally {
      setBusy(false);
      guard.current = false;
    }
  }
  async function check() {
    setBusy(true);
    try {
      const { round } = await api("player", { action: "round", id: pending });
      await reveal(round);
      if (round.status === "settled") await refreshProfile();
    } catch (e) {
      if (e.status === 404) {
        setPending(null);
        setError(
          "No record of this round exists on the server. No automatic retry was made.",
        );
      } else setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="player-page">
      <div className="player-top">
        <Link className="player-brand" href="/games-management">
          <span className="brand-mark">M</span>
          <span>
            mega live <small>GAMES</small>
          </span>
        </Link>
        {isDemo && (
          <Link className="player-back" href="/games-management">
            <ArrowLeft size={15} /> Back to portal
          </Link>
        )}
      </div>
      <div className="player-shell roulette-shell">
        <div className="player-mode">
          <span>
            {isDemo ? <FlaskConical size={14} /> : <ShieldCheck size={14} />}{" "}
            {isDemo ? "PRACTICE MODE" : "MEGA ROOM GAME"}
          </span>
          <span>{room}</span>
        </div>
        <div className="player-title">
          <div>
            <span className="eyebrow">THE ORIGINAL MEGA WHEEL</span>
            <h1>{game.name}</h1>
          </div>
          <div className="roulette-balance">
            <strong>{fmt(user.availableCoins)}</strong>
            <small>{isDemo ? "practice coins" : "Mega coins"}</small>
          </div>
        </div>
        <div className="roulette-stage">
          <div className="wheel-pointer" />
          <Image
            loading="eager"
            src="/games/roulette/wheel.png"
            alt="Mega’s 37-pocket roulette wheel"
            style={{ transform: `rotate(${rotation}deg)` }}
            width={265}
            height={265}
          />
          <div className="roulette-result" aria-live="polite">
            {busy ? (
              "Spinning…"
            ) : result?.status === "settled" ? (
              <>
                <b className={resultColor(result.result).toLowerCase()}>
                  {result.result}
                </b>
                <span>
                  {resultColor(result.result)} ·{" "}
                  {result.outcome === "win"
                    ? `Net win +${fmt(result.payout - result.bet)}`
                    : result.outcome === "push"
                      ? "Break-even"
                      : `Net loss ${fmt(result.bet - result.payout)}`}{" "}
                  coins
                </span>
              </>
            ) : pending ? (
              "Round awaiting confirmation"
            ) : (
              "Place your chips to start"
            )}
          </div>
        </div>
        <div className="roulette-markets">
          {markets.map((m) => {
            const chance =
              (weights.reduce(
                (s, w, n) => s + (isBetWinner(m.label, n) ? w : 0),
                0,
              ) /
                weightSum) *
              100;
            return (
              <button
                key={m.label}
                className={
                  "roulette-market " +
                  (m.tone || "") +
                  (bets[m.label] ? " wagered" : "")
                }
                aria-label={`Bet ${chip} on ${m.label}`}
                disabled={busy || !!pending || game.status !== "active"}
                onClick={() => add(m.label)}
              >
                <b>{m.label}</b>
                <span>{m.payout}</span>
                <small>{chance.toFixed(2)}% chance</small>
                {bets[m.label] > 0 && <em>{fmt(bets[m.label])}</em>}
              </button>
            );
          })}
        </div>
        <div className="chip-selector" aria-label="Chip value">
          {chips.map((c) => (
            <button
              key={c}
              className={chip === c ? "chosen" : ""}
              aria-pressed={chip === c}
              disabled={busy || !!pending}
              onClick={() => setChip(c)}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="roulette-total">
          <span>
            Total bet <b>{fmt(total)} coins</b>
          </span>
          <button
            className="text-button"
            disabled={busy || !!pending || !total}
            onClick={() => setBets({})}
          >
            Clear bets
          </button>
        </div>
        {error && (
          <div className="player-error" role="alert">
            <AlertCircle size={18} />
            {error}
          </div>
        )}
        {game.status !== "active" && (
          <div className="player-error">
            The administrator has paused this game.
          </div>
        )}
        {!isDemo && !live && (
          <div className="player-error">Live betting is not yet enabled.</div>
        )}
        {pending ? (
          <button className="bet-button" disabled={busy} onClick={check}>
            <RotateCw size={18} /> Check round status
          </button>
        ) : (
          <button
            className="bet-button"
            disabled={
              busy ||
              game.status !== "active" ||
              total < game.minBet ||
              total > game.maxBet ||
              total > user.availableCoins ||
              (!isDemo && !live)
            }
            onClick={spin}
          >
            {busy ? "Spinning…" : `Bet ${fmt(total)} & spin`}
            <RotateCw size={18} />
          </button>
        )}
        <p className="player-rules">
          Total bet: {fmt(game.minBet)}–{fmt(game.maxBet)} coins.
          <br />
          Odds shown are based on the current pocket weights. Gross payouts
          include returned stake. Multiple markets can win on the same number.
        </p>
        <details className="roulette-rules">
          <summary>Wheel probabilities & payout rules</summary>
          <p>
            Each pocket is sampled independently using its configured weight.
            Settings revision {game.revision}.
          </p>
          <div className="pocket-probabilities">
            {weights.map((w, n) => (
              <span key={n}>
                <b>{n}</b> {((w / weightSum) * 100).toFixed(2)}%
              </span>
            ))}
          </div>
          <p>
            Zero pays 36×. Dozens pay 3×. Red, black, odd and even pay 2×. Zero
            loses every market except zero.
          </p>
        </details>
        {result?.status === "settled" && (
          <div className="round-receipt">
            <span>Last round</span>
            <b>
              Bet {fmt(result.bet)} · Gross payout {fmt(result.payout)}
            </b>
            <small>{result.id}</small>
          </div>
        )}
        <div className="player-bottom">
          <ShieldCheck size={14} />
          {isDemo
            ? "Practice coins only. No Mega balance changes."
            : "Every round is logged in your game portal."}
        </div>
      </div>
    </div>
  );
}
