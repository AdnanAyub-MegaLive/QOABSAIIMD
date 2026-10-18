"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import Image from "next/image";
import {api} from "./store";
import {miniGames} from "@/lib/game-control/mini-games.mjs";
import {markets} from "@/lib/game-control/roulette/engine.mjs";
import {wheelOrder} from "@/lib/game-control/roulette/original-rules.mjs";
import PointAmount from "./point-amount";
import PizzaWheel from "./pizza-wheel";
import TeenPattiTable from "./teen-patti-table";
import MiniGameAnimation from "./mini-game-animation";
import styles from "./play-panel.module.css";

export default function SharedPlayer({gameId,preview=false}){
 const request=useCallback(body=>preview?api("admin",{action:"preview-round",request:{...body,gameId}}):api("player",body),[preview,gameId]);
 const [state,setState]=useState(null),[error,setError]=useState(""),[now,setNow]=useState(0),[busy,setBusy]=useState(false);
 const [amount,setAmount]=useState(100),[custom,setCustom]=useState(false),[choice,setChoice]=useState(""),[bets,setBets]=useState({}),[answers,setAnswers]=useState([]),[question,setQuestion]=useState(0);
 const [pending,setPending]=useState(null),[help,setHelp]=useState(false);
 const offset=useRef(0),lastRound=useRef(""),guard=useRef(false),dialog=useRef(null),polling=useRef(false);
 const activeEntry=useRef(null);
 const load=useCallback(async()=>{
   if(polling.current)return;polling.current=true;
   try{const s=await request({action:"shared-state",gameId});offset.current=s.serverTime-Date.now();setNow(s.serverTime);setState(s);setError("");
     const key=`${s.dayId}:${s.slot}`;if(lastRound.current!==key){lastRound.current=key;setChoice("");setBets({});setAnswers([]);setQuestion(0);setPending(null);}
     setPending(p=>p&&(s.mineEntries||[]).some(e=>e.id===p.id)?null:p);
     if(activeEntry.current!==s.mine?.id){activeEntry.current=s.mine?.id;setQuestion(0);setAnswers([]);}
   }finally{polling.current=false;}
 },[gameId,request]);
 useEffect(()=>{let alive=true;const poll=()=>{if(document.hidden)return;load().catch(e=>{if(alive)setError(e.message);});};poll();const timer=setInterval(poll,2000),tick=setInterval(()=>setNow(Date.now()+offset.current),100);document.addEventListener("visibilitychange",poll);return()=>{alive=false;clearInterval(timer);clearInterval(tick);document.removeEventListener("visibilitychange",poll);};},[load]);
 useEffect(()=>{if(help)dialog.current?.showModal();else dialog.current?.close();},[help]);
 const game=state?.game,engine=game?.engine,mine=state?.mine;
 const phase=!state?"loading":now>=state.endsAt?"reset":now>=state.revealsAt?"reveal":now>=state.closesAt?"playing":"open";
 const remaining=state?Math.max(0,Math.ceil(((phase==="open"?state.closesAt:phase==="playing"?state.revealsAt:phase==="reset"&&state.phase==="reset"?state.resetAt:state.endsAt)-now)/1000)):0;
 const total=engine==="roulette"?Object.values(bets).reduce((a,b)=>a+b,0):amount;
 const options=["pizza","teenpatti"].includes(engine)?[]:engine==="flip"?["heads","tails"]:miniGames[engine]?.choices||[];
 const timed=["reaction","trivia"].includes(engine);
 const locked=busy||!!pending||phase!=="open";
 async function enter(selectedChoice){
   if(guard.current||!state)return;guard.current=true;setBusy(true);setError("");
   const payload=pending||{action:"shared-enter",id:crypto.randomUUID(),gameId,dayId:state.dayId,slot:state.slot,amount:total,custom,choice:typeof selectedChoice==="string"?selectedChoice:choice,bets:engine==="roulette"?bets:undefined};
   try{setPending(payload);await request(payload);setPending(null);setBets({});await load();}catch(e){if(e.status&&e.status<500)setPending(null);setError(e.message);}finally{guard.current=false;setBusy(false);}
 }
 async function answer(value){
   if(guard.current||!mine)return;
   if(engine==="trivia"&&question+1<state.challenge.questions.length){setAnswers([...answers,value]);setQuestion(question+1);setChoice("");return;}
   guard.current=true;setBusy(true);setError("");
   try{await request({action:"shared-answer",id:mine.id,answers:engine==="trivia"?[...answers,value]:undefined});await load();}catch(e){setError(e.message);}finally{guard.current=false;setBusy(false);}
 }
 async function refill(){if(guard.current)return;guard.current=true;setBusy(true);try{await request({action:"refill"});await load();}catch(e){setError(e.message);}finally{guard.current=false;setBusy(false);}}
 const outcome=state?.outcome;
 const animationRound=outcome?{result:engine==="dice"?`Rolled ${outcome.result}`:engine==="rps"?`Computer: ${outcome.result}`:engine==="penalty"?`Keeper: ${outcome.result}`:outcome.result,choice:mine?.input.choice,outcome:mine?.result?.outcome}:null;
 const waiting=phase==="playing";
 const rotation=state?(state.slot+1)*1080+(outcome&&engine==="roulette"?(360-wheelOrder.indexOf(outcome.result)*360/37)%360:0):0;
 const quiz=state?.challenge?.questions?.[question];
 function placeChoice(value){if(locked)return;setChoice(value);void enter(value);}
 return <section className={`${styles.panel} ${engine==="teenpatti"?styles.teenPanel:""}`} aria-label="Shared free-point room game">
   <header className={styles.header}><div><small>{preview?"ADMIN PREVIEW · AUTOMATIC ROUNDS":"FREE POINTS · AUTOMATIC ROOM ROUNDS"}</small><h1>{game?.name||"Connecting…"}</h1><small>Round {state?.roundNumber||"—"} · Completed today {state?.totalRounds||0}</small></div><button onClick={()=>setHelp(true)} aria-label="Rules and round history">?</button></header>
   <div className={styles.stage}>
     {engine==="roulette"?<div className={styles.wheel}><i/><Image src="/games/roulette/wheel.png" alt="Shared roulette result" width={300} height={300} style={{transform:`rotate(${rotation}deg)`}}/></div>
      :engine==="teenpatti"?<TeenPattiTable phase={phase} remaining={remaining} outcome={outcome} totals={state?.totals} myTotals={state?.myTotals} mine={mine} onPlace={placeChoice} disabled={locked} roundNumber={state?.roundNumber}/>
      :engine==="flip"?<div className={`${styles.coin} ${waiting?styles.flipping:""}`}><b>{outcome?.result?.toUpperCase()||"M"}</b><span>SHARED FLIP</span></div>
      :engine==="pizza"?<PizzaWheel game={game} choice={mine?.input.choice||choice} onChoose={placeChoice} disabled={locked} result={outcome?.result} playing={waiting} elapsed={Math.max(0,now-state.closesAt)} countdown={remaining}/>
      :engine?<MiniGameAnimation engine={engine} phase={outcome?"revealed":waiting?"playing":"idle"} round={animationRound} choice={mine?.input.choice||choice} challenge={state?.challenge?{...state.challenge,expiresAt:state.revealsAt}:null} now={now}/>:null}
   </div>
   <div className={styles.status} role="status">{error||`${phase.toUpperCase()} · ${remaining}s · ${state?.participants||0} players · ${state?.totalPoints||0} points`}{mine?.result&&<div>{mine.result.result} · {mine.result.payout} free points returned</div>}</div>
   <div className={styles.table}>
     {mine&&<span key={mine.id} className={styles.sharedEntryChip} aria-hidden="true">● {mine.amount}</span>}
     {engine==="trivia"&&phase==="playing"&&quiz&&mine&&!mine.answered?<><p className={styles.question}>{question+1}/{state.challenge.questions.length} · {quiz.text}</p><div className={styles.miniChoices}>{quiz.options.map((text,i)=><button key={i} disabled={busy} onClick={()=>answer(String(i))}>{text}</button>)}</div></>
      :engine==="reaction"&&phase==="playing"&&state?.challenge&&mine&&!mine.answered?<button className={`${styles.reactionPad} ${now>=state.challenge.readyAt?styles.go:""}`} disabled={busy} onClick={()=>answer("tap")}>{now>=state.challenge.readyAt?"TAP NOW!":"WAIT…"}</button>
      :engine==="roulette"?<div className={styles.markets}>{markets.map(m=><button key={m.label} disabled={locked} onClick={()=>{if(!Number.isSafeInteger(amount)||amount<1||total+amount>Number(state.availablePoints))return;setBets({...bets,[m.label]:(bets[m.label]||0)+amount});}}><b>{m.label}</b><small>{m.payout}</small><span>{bets[m.label]||0} pts</span></button>)}</div>
      :<div className={engine==="teenpatti"?styles.sharedHands:styles.miniChoices}>{options.map((opt,i)=><button key={opt} disabled={locked} aria-pressed={choice===opt} data-winner={outcome?.winners?.includes(opt)||false} onClick={()=>setChoice(opt)}>{engine==="teenpatti"?<><small>HAND {opt}</small><span className={styles.threeCards}>{(outcome?.hands?.[i]?.cards||["?","?","?"]).map((card,j)=><i key={j}>{card}</i>)}</span><small>{outcome?.hands?.[i]?.label||"Hidden cards"}</small><small>{state?.totals?.[opt]||0} pts</small></>:opt}</button>)}</div>}
     {phase==="open"&&<PointAmount game={{...game,minBet:1,maxBet:Number(state.availablePoints)}} value={amount} custom={custom} disabled={busy||!!pending} onChange={(n,c)=>{setAmount(n);setCustom(c);}}/>}
     <div className={styles.actions}><span>{mine?mine.answered?"Answer saved":"Points placed":phase==="open"?"Place points before time runs out":"Next round starts automatically"}<b>{state?.myTotal||0} pts this round</b></span>{engine==="roulette"&&!locked&&<button onClick={()=>setBets({})}>Clear</button>}{(!["teenpatti","pizza"].includes(engine)||pending)&&<button className={styles.play} disabled={busy||(!pending&&(phase!=="open"||!game||!Number.isSafeInteger(total)||total<1||total>Number(state.availablePoints)||(!timed&&engine!=="roulette"&&!choice)))} onClick={()=>enter()}>{pending?"Retry placement":"Place points"}</button>}</div>
   </div>
   <footer className={styles.footer}><span><b>{Number(state?.availablePoints||0).toLocaleString()}</b> free points</span><button disabled={busy||!!pending} onClick={refill}>Free refill</button><small>No cash value · Round counter resets at 00:00 UTC</small></footer>
   <dialog ref={dialog} className={styles.help} onClose={()=>setHelp(false)}><header><h2>Shared room rounds</h2><button onClick={()=>setHelp(false)}>Close</button></header><p>Rounds advance even without players. Join during the 20-second entry window. Points are reserved immediately; winning returns arrive after the shared reveal. Place repeatedly on different options while the countdown is open. Only your remaining free points limit placements.</p><p>Daily round counters reset at midnight UTC. Free points and history are not reset. No wallet Coins, Diamonds, XP or redeemable prizes.</p><p>Trivia uses shared difficulty pools, cycling only when exhausted. All required answers must be correct. Reaction timing includes network latency.</p><h3>Recent rounds</h3>{state?.history?.map(h=><p key={h.roundNumber}>#{h.roundNumber}: {String(h.result??"Reaction round")}</p>)}</dialog>
 </section>;
}
