"use client";
import { useEffect, useRef, useState } from "react";
import RoulettePlayer from "./roulette-player";
import Link from "next/link";
import {
  ArrowLeft,
  Coins,
  ShieldCheck,
  FlaskConical,
  RotateCw,
  ArrowUpRight,
  AlertCircle,
  LockKeyhole,
  History,
} from "lucide-react";
import { useStore, api } from "./store";
import { formatCoins as fmt } from "@/lib/game-control/demo";
export default function Player({ defaultGame = "lucky-flip" }) {
  const { isDemo, data, demoBet } = useStore();
  const [gameId, setGameId] = useState(defaultGame),
    [liveProfile, setLiveProfile] = useState(null),
    [loading, setLoading] = useState(!isDemo),
    [error, setError] = useState(""),
    [choice, setChoice] = useState("heads"),
    [bet, setBet] = useState(100),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState(null),
    [rounds, setRounds] = useState([]),
    [pending, setPending] = useState(null);
  const launched = useRef(false),
    inFlight = useRef(false);
  useEffect(() => {
    if (launched.current) return;
    launched.current = true;
    const params = new URLSearchParams(location.search);
    setGameId(params.get("game") || defaultGame);
    if (isDemo) return;
    const fragment = new URLSearchParams(location.hash.slice(1));
    const token = fragment.get("token") || params.get("token");
    if (token) { const url = new URL(location.href); url.searchParams.delete("token"); history.replaceState(null, "", url.pathname + url.search); }
    api("player", token ? { action: "launch", token, roomId: params.get("roomId") } : { action: "profile" })
      .then((p) => {
        setLiveProfile(p);
        if (token) {
          const url = new URL(location.href);
          url.searchParams.delete("token");
          history.replaceState(null, "", url.pathname + url.search);
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [defaultGame, isDemo]);
  const games = isDemo ? data.games : liveProfile?.games || [];
  const game = games.find((g) => g.id === gameId);
  const user = isDemo
    ? { nickname: "Demo Player", availableCoins: data.balance }
    : liveProfile?.user;
  const room = isDemo ? "Demo room" : liveProfile?.roomId;
  async function refreshProfile() {
    const value = await api("player", { action: "profile" });
    setLiveProfile(value);
  }
  async function play() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      if (isDemo) {
        await new Promise((resolve) => setTimeout(resolve, 650));
        const r = demoBet(game.id, bet, choice);
        setResult(r);
        setRounds((p) => [r, ...p].slice(0, 10));
      } else {
        const id = crypto.randomUUID();
        setPending(id);
        const r = (
          await api("player", {
            action: "bet",
            id,
            gameId: game.id,
            bet,
            choice,
            revision: game.revision,
          })
        ).round;
        setResult(r);
        if (r.status === "settled") {
          setPending(null);
          setRounds((p) => [r, ...p].slice(0, 10));
        }
        await refreshProfile();
      }
    } catch (e) {
      setError(
        e.message +
          (isDemo
            ? ""
            : " If a bet was submitted, check its status before doing anything else."),
      );
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }
  async function checkRound() {
    if (!pending) return;
    setBusy(true);
    try {
      const { round } = await api("player", { action: "round", id: pending });
      setResult(round);
      if (round.status === "settled") {
        setPending(null);
        setRounds((p) =>
          p.some((r) => r.id === round.id) ? p : [round, ...p],
        );
        await refreshProfile();
      }
    } catch (e) {
      if (e.status === 404) {
        setPending(null);
        setError(
          "The server has no record of this round. No automatic retry was made.",
        );
      } else setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (!loading && game?.engine === "roulette")
    return (
      <RoulettePlayer
        game={game}
        user={user}
        room={room}
        live={liveProfile?.live}
        refreshProfile={refreshProfile}
      />
    );
  return (
    <div className="player-page">
      <div className="player-top">
        <Link href="/games-management" className="player-brand">
          <span className="brand-mark">M</span>
          <span>
            mega live <small>GAMES</small>
          </span>
        </Link>
        {isDemo && (
          <Link href="/games-management" className="player-back">
            <ArrowLeft size={15} /> Back to portal
          </Link>
        )}
      </div>
      <div className="player-shell">
        <div className="player-mode">
          <span>
            {isDemo ? <FlaskConical size={14} /> : <ShieldCheck size={14} />}{" "}
            {isDemo ? "PRACTICE MODE" : "MEGA ROOM GAME"}
          </span>
          <span>{room || "Connecting…"}</span>
        </div>
        {loading ? (
          <div className="player-empty">
            <RotateCw className="spin" size={30} />
            <h2>Connecting to Mega Live…</h2>
            <p>Loading your profile and balance.</p>
          </div>
        ) : !game || game.engine !== "flip" ? (
          <div className="player-empty">
            <LockKeyhole size={32} />
            <h2>
              {gameId === "roulette"
                ? "Roulette is not connected"
                : "Game unavailable"}
            </h2>
            <p>
              {error ||
                "Open this game from the Mega Live app to use your coin wallet."}
            </p>
            {isDemo && (
              <Link href="/games-management" className="button primary">
                Back to game catalog
              </Link>
            )}
          </div>
        ) : (
          <>
            <div className="player-title">
              <div>
                <span className="eyebrow">PICK. FLIP. REVEAL.</span>
                <h1>{game.name}</h1>
              </div>
              <span className="game-icon purple">
                <Coins size={27} />
              </span>
            </div>
            <div className="player-wallet">
              <div>
                <span className="player-avatar">
                  {user?.nickname?.slice(0, 1) || "P"}
                </span>
                <span>
                  <b>{user?.nickname}</b>
                  <small>
                    {isDemo ? "Practice coin wallet" : "Mega Live wallet"}
                  </small>
                </span>
              </div>
              <div>
                <strong>{fmt(user?.availableCoins)}</strong>
                <small>coins available</small>
              </div>
            </div>
            <div className="flip-stage">
              <div
                className={
                  "flip-token " +
                  (busy ? "flipping" : "") +
                  (result?.outcome === "win" ? " winner" : "")
                }
              >
                <Coins size={53} />
                <span>
                  {busy
                    ? "FLIPPING"
                    : result?.status === "settled"
                      ? result.result.toUpperCase()
                      : "MEGA"}
                </span>
              </div>
              <div className="result-message" aria-live="polite">
                {busy ? (
                  <>
                    <b>Finding your side…</b>
                    <span>One round at a time.</span>
                  </>
                ) : result?.status === "settled" ? (
                  <>
                    <b className={result.outcome === "win" ? "won-text" : ""}>
                      {result.outcome === "win"
                        ? `You won ${fmt(result.payout)} coins`
                        : "Not your flip this time"}
                    </b>
                    <span>
                      {result.outcome === "win"
                        ? `Gross return · Net +${fmt(result.payout - result.bet)} coins`
                        : `${fmt(result.bet)} coins wagered · No payout`}
                    </span>
                  </>
                ) : pending ? (
                  <>
                    <b>Round awaiting confirmation</b>
                    <span>
                      Do not place another bet until this is resolved.
                    </span>
                  </>
                ) : (
                  <>
                    <b>Which side is yours?</b>
                    <span>Choose heads or tails to start.</span>
                  </>
                )}
              </div>
            </div>
            <div className="choice-label">YOUR PICK</div>
            <div className="side-choices">
              {["heads", "tails"].map((side) => (
                <button
                  key={side}
                  className={choice === side ? "chosen" : ""}
                  aria-pressed={choice === side}
                  disabled={busy || !!pending}
                  onClick={() => setChoice(side)}
                >
                  <span>{side === "heads" ? "H" : "T"}</span>
                  <b>{side[0].toUpperCase() + side.slice(1)}</b>
                  <small>{game.winProbability}% win chance</small>
                </button>
              ))}
            </div>
            <div className="bet-label">
              <label htmlFor="bet">Bet amount</label>
              <span>
                {fmt(game.minBet)}–{fmt(game.maxBet)} coins
              </span>
            </div>
            <div className="bet-input">
              <Coins size={19} />
              <input
                id="bet"
                type="number"
                inputMode="numeric"
                min={game.minBet}
                max={game.maxBet}
                step="1"
                disabled={busy || !!pending}
                value={bet}
                onChange={(e) => setBet(Number(e.target.value))}
              />
              <span>coins</span>
            </div>
            <div className="quick-bets">
              {[game.minBet, 100, 500, game.maxBet]
                .filter(
                  (v, i, a) =>
                    v >= game.minBet && v <= game.maxBet && a.indexOf(v) === i,
                )
                .map((v) => (
                  <button
                    key={v}
                    disabled={busy || !!pending}
                    onClick={() => setBet(v)}
                  >
                    {fmt(v)}
                  </button>
                ))}
            </div>
            <div className="potential">
              <span>
                Return on a win <b>{game.payoutMultiplier}×</b>
              </span>
              <strong>
                {fmt(
                  Math.floor(
                    (bet * Math.round(game.payoutMultiplier * 100)) / 100,
                  ),
                )}{" "}
                coins
              </strong>
            </div>
            {error && (
              <div className="player-error" role="alert">
                <AlertCircle size={18} />
                {error}
              </div>
            )}
            {game.status !== "active" && (
              <div className="player-error">
                This game is paused by the administrator.
              </div>
            )}
            {!isDemo && !liveProfile?.live && (
              <div className="player-error">
                Live betting is not yet enabled.
              </div>
            )}
            {pending ? (
              <button
                className="bet-button"
                disabled={busy}
                onClick={checkRound}
              >
                <RotateCw size={18} /> Check round status
              </button>
            ) : (
              <button
                className="bet-button"
                disabled={
                  busy ||
                  game.status !== "active" ||
                  (!isDemo && !liveProfile?.live) ||
                  !Number.isInteger(bet) ||
                  bet < game.minBet ||
                  bet > game.maxBet ||
                  bet > (user?.availableCoins ?? 0)
                }
                onClick={play}
              >
                {busy ? "Flipping…" : `Bet ${fmt(bet)} & flip`}
                <ArrowUpRight size={19} />
              </button>
            )}
            <p className="player-rules">
              Win chance: <b>{game.winProbability}%</b> · Gross payout:{" "}
              <b>{game.payoutMultiplier}×</b>
              <br />
              Payout includes your stake. Each round is independent. Heads and
              tails have the same configured win chance.
            </p>
            {rounds.length > 0 && (
              <div className="player-history">
                <h3>
                  <History size={17} /> Your recent rounds
                </h3>
                {rounds.map((r) => (
                  <div key={r.id}>
                    <span>
                      {r.choice} · {fmt(r.bet)} coins
                    </span>
                    <b className={r.outcome === "win" ? "won-text" : ""}>
                      {r.outcome === "win"
                        ? `+${fmt(r.payout - r.bet)}`
                        : `−${fmt(r.bet)}`}
                    </b>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        <div className="player-bottom">
          <ShieldCheck size={14} />
          {isDemo
            ? "Practice coins only. No Mega balance changes."
            : "Your bets and results are recorded securely."}
        </div>
      </div>
    </div>
  );
}
