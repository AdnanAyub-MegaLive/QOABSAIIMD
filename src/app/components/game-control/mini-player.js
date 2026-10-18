"use client";
import { useEffect, useRef, useState } from "react";
import { useStore, api } from "./store";
import { miniGames, makeChallenge, publicChallenge } from "@/lib/game-control/mini-games.mjs";
import styles from "./play-panel.module.css";
import MiniGameAnimation from "./mini-game-animation";
import PointAmount from "./point-amount";
import { selectPreviewTrivia, triviaTier } from "@/lib/game-control/trivia-plan.mjs";

export default function MiniPlayer({ game, points, refresh }) {
  const { isDemo, demoBet, refillDemo } = useStore();
  const info = miniGames[game.engine], timed = ["reaction", "trivia"].includes(game.engine);
  const [choice, setChoice] = useState(info.choices[0] || ""), [amount, setAmount] = useState(game.minBet);
  const [challenge, setChallenge] = useState(null), [now, setNow] = useState(0), [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("Free points only. No prizes or cash value."), [help, setHelp] = useState(false);
  const [phase, setPhase] = useState("idle"), [result, setResult] = useState(null);
  const [custom,setCustom]=useState(false),[answers,setAnswers]=useState([]),[questionIndex,setQuestionIndex]=useState(0);
  const demoHistory=useRef({});
  const guard = useRef(false), dialog = useRef(null), offset = useRef(0);
  useEffect(() => { if (!challenge) return; const timer = setInterval(() => setNow(Date.now() + offset.current), 50); return () => clearInterval(timer); }, [challenge]);
  useEffect(() => { if (help) dialog.current?.showModal(); else dialog.current?.close(); }, [help]);
  const expired = challenge && now > challenge.expiresAt;
  async function start() {
    if (guard.current) return;
    guard.current = true; setBusy(true);
    setPhase("idle"); setResult(null);
    try {
      let value;
      if (isDemo) {
        let raw;
        if(game.engine==="trivia"){
          const selected=selectPreviewTrivia(amount,custom,demoHistory.current,max=>crypto.getRandomValues(new Uint32Array(1))[0]%max);demoHistory.current=selected.history;
          raw={tier:selected.tier,questions:selected.questions,expiresAt:Date.now()+selected.questions.length*(game.triviaSeconds??20)*1000};
        }else raw=makeChallenge(game.engine,crypto.getRandomValues(new Uint32Array(1))[0],Date.now());
        value={id:crypto.randomUUID(),raw,serverTime:Date.now(),...(game.engine==="trivia"?raw:publicChallenge(game.engine,raw))};
      }
      else value = await api("player", { action: "challenge", gameId: game.id, bet:amount, custom });
      setAnswers([]);setQuestionIndex(0);
      offset.current = value.serverTime - Date.now(); setNow(value.serverTime); setChallenge(value); setChoice("");
      setMessage(game.engine === "reaction" ? "Wait for green. Early taps lose." : "Choose the correct answer.");
    } catch (e) { setMessage(e.message); } finally { guard.current = false; setBusy(false); }
  }
  async function play(answer = choice) {
    if (guard.current) return;
    if(game.engine==="trivia"&&!pending){
      const next=[...answers,answer];
      if(questionIndex+1<challenge.questions.length){setAnswers(next);setQuestionIndex(questionIndex+1);setChoice("");return;}
      answer=next;
    }
    guard.current = true; setBusy(true);
    setPhase("playing"); setResult(null);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const animation = new Promise(resolve => setTimeout(resolve, reducedMotion ? 0 : timed ? 450 : 1100));
    const request = pending || { action: "bet", id: challenge?.id || crypto.randomUUID(), gameId: game.id, revision: challenge?.revision || game.revision, bet: amount, choice: answer };
    try {
      let round;
      if (isDemo) round = demoBet(game.id, amount, answer, undefined, challenge?.raw);
      else { setPending(request); round = (await api("player", request)).round; }
      // Submit timed answers immediately; only delay presentation, never reaction timing.
      await animation;
      setResult(round); setPhase("revealed");
      if (game.engine === "penalty" && !reducedMotion) await new Promise(resolve => setTimeout(resolve, 800));
      setPending(null); setChallenge(null); setMessage(`${round.result} · ${round.payout} free points returned`);
      if (!isDemo) await refresh();
    } catch (e) { setPhase("idle"); if (e.status && e.status < 500) { setPending(null); setChallenge(null); } setMessage(e.message); }
    finally { guard.current = false; setBusy(false); }
  }
  async function refill() {
    if (guard.current || pending || challenge) return;
    guard.current = true; setBusy(true);
    try { if (isDemo) refillDemo(); else { await api("player", { action: "refill" }); await refresh(); } }
    catch (e) { setMessage(e.message); } finally { guard.current = false; setBusy(false); }
  }
  const currentQuestion=challenge?.questions?.[questionIndex];
  const options = game.engine === "trivia" ? currentQuestion?.options || [] : info.choices;
  const tier=Number.isSafeInteger(amount)&&amount>0?triviaTier(amount,custom):null;
  return <section className={styles.panel} aria-label={game.name}>
    <header className={styles.header}><div><small>MEGA PLAY · FREE POINTS</small><h1>{game.name}</h1></div><button onClick={() => setHelp(true)} aria-label="How to play">?</button></header>
    <div className={styles.stage}><MiniGameAnimation game={game} engine={game.engine} phase={phase} round={result} choice={choice} challenge={challenge} now={now} /></div>
    <div className={styles.status} role="status">{expired ? "Time is up. Start another challenge." : message}</div>
    <div className={styles.table}>
      {game.engine === "trivia" && <p className={styles.question}>{challenge?`${questionIndex+1}/${challenge.questions.length} · ${currentQuestion.text}`:`${tier?.tier||"Choose points"} · ${tier?.count||0} question(s)`} {challenge&&<small>{Math.max(0, Math.ceil((challenge.expiresAt - now) / 1000))}s remaining</small>}</p>}
      {game.engine === "reaction" && challenge ? <button className={`${styles.reactionPad} ${now >= challenge.readyAt ? styles.go : ""}`} disabled={busy || !!pending || expired} onClick={() => play("tap")}>{now < challenge.readyAt ? "WAIT…" : "TAP NOW!"}</button>
        : <div className={styles.miniChoices}>{options.map((item, index) => { const value = game.engine === "trivia" ? String(index) : item; return <button key={value} aria-pressed={choice === value} disabled={busy || !!pending || expired} onClick={() => setChoice(value)}>{item}</button>; })}</div>}
      <PointAmount game={game} value={amount} custom={custom} disabled={busy||!!pending||!!challenge&&!expired} onChange={(value,mode)=>{setAmount(value);setCustom(mode);}} />
      <div className={styles.actions}><span>Play <b>{Number.isNaN(amount)?"—":amount} free points</b></span><button className={styles.play} disabled={busy || game.status !== "active" || (!pending && (!Number.isSafeInteger(amount)||amount<game.minBet||amount>game.maxBet||amount > points || (timed && challenge && !expired && (!choice || game.engine === "reaction"))))} onClick={() => pending ? play() : timed && (!challenge || expired) ? start() : play()}>{pending ? "Retry same round" : timed && (!challenge || expired) ? "Start" : game.engine==="trivia"&&challenge&&questionIndex+1<challenge.questions.length?"Next question":"Play"}</button></div>
    </div>
    <footer className={styles.footer}><span><b>{Number(points).toLocaleString()}</b> free points</span><button disabled={busy || !!pending || !!challenge} onClick={refill}>Free refill</button><small>No purchases · No cash value · No rewards</small></footer>
    <dialog ref={dialog} className={styles.help} onClose={() => setHelp(false)}><header><h2>How to play</h2><button onClick={() => setHelp(false)} aria-label="Close help">×</button></header><p>{info.help}</p><p>Winning return: {game.pointReturnMultiplier??(game.engine==="dice"?6:2)}× including points played. {game.engine==="reaction"?`Reaction target: ${game.reactionWindowMs??1000} ms.`:""} {game.engine==="trivia"?`Round time: ${game.triviaSeconds??20} seconds × question count.`:""}</p><p>Solo play. Free points cannot be bought, transferred or redeemed. No wallet, XP or valuable prizes.</p></dialog>
  </section>;
}
