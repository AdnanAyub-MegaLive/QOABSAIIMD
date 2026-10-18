import styles from "./mini-game-animation.module.css";
import PizzaWheel from "./pizza-wheel";

const hands = { rock: "✊", paper: "✋", scissors: "✌️" };
const dice = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
export default function MiniGameAnimation({ engine, phase, round, choice, challenge, now, game }) {
  const active = phase === "playing", revealed = phase === "revealed";
  const opponent = round?.result?.match(/Computer: (rock|paper|scissors)/)?.[1];
  const face = Number(round?.result?.match(/Rolled (\d)/)?.[1] || 1);
  const keeper = round?.result?.match(/Keeper: (left|centre|right)/)?.[1];
  const direction = value => value === "left" ? "-70px" : value === "right" ? "70px" : "0px";
  const ready = challenge && now >= challenge.readyAt && now <= challenge.expiresAt;
  return <div className={styles.scene} data-engine={engine} data-phase={phase} aria-hidden="true">
    {engine==="pizza"&&<PizzaWheel game={game} result={revealed?round?.result:null} choice={choice} playing={active} elapsed={now||0}/>}
    {engine === "teenpatti" && <div className={styles.cardTable}><small>COMPUTER</small><div>{(revealed?round?.computerCards:["?","?","?"])?.map((card,i)=><span key={i} className={styles.playingCard}>{card}</span>)}</div><div>{(revealed?round?.playerCards:["♠","♥","♣"])?.map((card,i)=><span key={i} className={styles.playingCard}>{card}</span>)}</div><small>YOU</small></div>}
    {engine === "rps" && <div className={styles.hands}><div><span className={styles.hand}>{revealed ? hands[round?.choice] : active ? "✊" : hands[choice] || "✊"}</span><small>YOU</small></div><b>VS</b><div><span className={styles.hand}>{revealed ? hands[opponent] : "✊"}</span><small>COMPUTER</small></div></div>}
    {engine === "dice" && <div className={styles.die}>{active ? <span className={styles.dieStrip}>{[...dice, ...dice].map((value, i) => <span key={i}>{value}</span>)}</span> : dice[revealed ? face - 1 : 0]}</div>}
    {engine === "penalty" && <div className={styles.pitch} style={{ "--shot-x": direction(round?.choice || choice), "--keeper-x": direction(keeper) }}><div className={styles.goal} /><span className={styles.keeper}>🧤</span><span className={styles.ball}>⚽</span></div>}
    {engine === "reaction" && <div className={styles.signal} data-ready={!!ready}><span className={styles.lamp} /><b>{revealed ? round?.outcome === "win" ? "QUICK!" : "TRY AGAIN" : ready ? "GO!" : challenge ? "WAIT" : "READY?"}</b><div className={styles.ripple} /></div>}
    {engine === "trivia" && <div className={styles.quiz}><div className={styles.card}>{revealed ? round?.outcome === "win" ? "✓" : "×" : "?"}</div><div className={styles.timer}><span style={{ width: `${challenge ? Math.max(0, Math.min(100, (challenge.expiresAt - now) / 150)) : 100}%` }} /></div><small>{revealed ? round?.outcome === "win" ? "CORRECT" : "NEXT TIME" : "TRIVIA BATTLE"}</small></div>}
    {revealed && <div className={styles.result} data-won={round?.outcome === "win"}>{round?.outcome === "win" ? "★ NICE PLAY ★" : round?.outcome === "push" ? "DRAW" : "PLAY AGAIN"}</div>}
  </div>;
}
