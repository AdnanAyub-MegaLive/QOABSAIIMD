"use client";
import RoundResults from "./round-results";
import {roundSummary} from "@/lib/game-control/round-summary.mjs";
import {useCallback,useEffect,useRef,useState} from "react";
import RouletteWheel from "./roulette-wheel";
import GameRules from "./game-rules";
import {api} from "./store";
import {miniGames} from "@/lib/game-control/mini-games.mjs";
import {markets} from "@/lib/game-control/roulette/engine.mjs";
import PointAmount from "./point-amount";
import PizzaWheel from "./pizza-wheel";
import TeenPattiTable from "./teen-patti-table";
import MiniGameAnimation from "./mini-game-animation";
import InstantStage from "./instant-stage";
import FlipStage from "./flip-stage";
import {instantGames} from "@/lib/game-control/instant-games.mjs";
import "./shared-visuals.css";
import styles from "./play-panel.module.css";
import "./roulette-design.css";

export default function SharedPlayer({gameId,preview=false}){
 const request=useCallback(body=>preview?api("admin",{action:"preview-round",request:{...body,gameId}}):api("player",body),[preview,gameId]);
 const [state,setState]=useState(null),[error,setError]=useState(""),[now,setNow]=useState(0),[busy,setBusy]=useState(false);
 const [amount,setAmount]=useState(100),[custom,setCustom]=useState(false),[choice,setChoice]=useState(""),[bets,setBets]=useState({}),[answers,setAnswers]=useState([]),[question,setQuestion]=useState(0);
 const [wheelReady,setWheelReady]=useState(null);
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
 const balance=state?.availableCoins??state?.availablePoints??"0";
 const currency=preview?"practice coins":"coins";
 const phase=!state?"loading":now>=state.endsAt?"reset":now>=state.revealsAt?"reveal":now>=state.closesAt?"playing":"open";
 const remaining=state?Math.max(0,Math.ceil(((phase==="open"?state.closesAt:phase==="playing"?state.revealsAt:phase==="reset"&&state.phase==="reset"?state.resetAt:state.endsAt)-now)/1000)):0;
 const total=engine==="roulette"?Object.values(bets).reduce((a,b)=>a+b,0):amount;
 const options=["pizza","teenpatti"].includes(engine)?[]:engine==="flip"?["heads","tails"]:miniGames[engine]?.choices||[];
 const timed=["reaction","trivia"].includes(engine);
 const locked=busy||!!pending||!!error||state?.acceptingBets===false||phase!=="open";
 async function enter(selectedChoice){
   if(guard.current||!state)return;guard.current=true;setBusy(true);setError("");
   const payload=pending||{action:"shared-enter",id:crypto.randomUUID(),gameId,dayId:state.dayId,slot:state.slot,amount:total,custom,choice:typeof selectedChoice==="string"?selectedChoice:choice||(options.length===1?options[0]:""),bets:engine==="roulette"?bets:undefined};
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
 const summary=roundSummary(state?.mineEntries);
 const latest=state?.mineEntries?.at(-1);
 const animationRound=outcome?{result:engine==="dice"?`Rolled ${outcome.result}`:engine==="rps"?`Computer: ${outcome.result}`:engine==="penalty"?`Keeper: ${outcome.result}`:outcome.result,choice:latest?.input.choice,outcome:summary.pending?undefined:BigInt(summary.net)>0n?"win":BigInt(summary.net)<0n?"loss":"push"}:null;
 const waiting=phase==="playing";
 const roundKey=state?`${state.dayId}:${state.slot}`:null;
 const visualResult=outcome?{id:`${state.dayId}:${state.slot}`,status:"settled",result:String(outcome.result),outcome:summary.pending?undefined:BigInt(summary.net)>0n?"win":BigInt(summary.net)<0n?"loss":"push"}:null;
 const quiz=state?.challenge?.questions?.[question];
 function placeChoice(value){if(locked)return;setChoice(value);void enter(value);}
 return <section className={`${styles.panel} ${engine==="roulette"?"roulette-design":""} ${engine==="teenpatti"?styles.teenPanel:""}`} aria-label="Shared room coin game">
   <header className={styles.header}><div><h1>{game?.name||"Connecting…"}</h1><div className={styles.roundHistory} aria-label="Recent results">{state?.history?.slice(0,5).map(h=><span key={h.roundNumber} title={`Round ${h.roundNumber}`}>{engine==="reaction"?"✓":String(h.result??"✓")}</span>)}</div></div><button onClick={()=>setHelp(true)} aria-label="Game rules">?</button></header>
   <div className={styles.stage}>
     {engine==="roulette"?<RouletteWheel roundKey={roundKey} playing={waiting} result={outcome?.result} onSettled={setWheelReady}/>
      :instantGames[engine]?<div className="shared-game-visuals"><InstantStage engine={engine==="highlow"?"dice":engine} busy={waiting} result={visualResult} choice={latest?.input.choice||choice||options[0]}/></div>
      :engine==="teenpatti"?<TeenPattiTable phase={phase} remaining={remaining} outcome={outcome} totals={state?.totals} myTotals={state?.myTotals} mine={mine} onPlace={placeChoice} disabled={locked} roundNumber={state?.roundNumber}/>
      :engine==="flip"?<div className="shared-game-visuals"><FlipStage busy={waiting} result={visualResult} choice={latest?.input.choice||choice||"heads"}/></div>
      :engine==="pizza"?<PizzaWheel game={game} choice={latest?.input.choice||choice} onChoose={placeChoice} disabled={locked} result={outcome?.result} playing={waiting} elapsed={Math.max(0,now-state.closesAt)} countdown={remaining}/>
      :engine?<MiniGameAnimation engine={engine} phase={outcome?"revealed":waiting?"playing":"idle"} round={animationRound} choice={latest?.input.choice||choice} challenge={state?.challenge?{...state.challenge,expiresAt:state.revealsAt}:null} now={now}/>:null}
   </div>
   <div className={engine==="roulette"?"roulette-betting-panel":"shared-betting-contents"}>
   <div className={styles.status} role="status">{engine==="roulette"&&<span className="roulette-timer-icon"/>}{error||`${state?.acceptingBets===false?"Betting paused":phase==="open"?"Place your bets":phase==="playing"?"Playing":phase==="reveal"?"Results":"Next round"} · ${remaining}s`}</div>
   <div className={styles.table}>
     {latest&&<span key={latest.id} className={styles.sharedEntryChip} aria-label="Latest bet">● +{latest.amount} · Total {summary.wager}</span>}
     {engine==="trivia"&&phase==="playing"&&quiz&&mine&&!mine.answered?<><p className={styles.question}>{question+1}/{state.challenge.questions.length} · {quiz.text}</p><div className={styles.miniChoices}>{quiz.options.map((text,i)=><button key={i} disabled={busy} onClick={()=>answer(String(i))}>{text}</button>)}</div></>
      :engine==="reaction"&&phase==="playing"&&state?.challenge&&mine&&!mine.answered?<button className={`${styles.reactionPad} ${now>=state.challenge.readyAt?styles.go:""}`} disabled={busy} onClick={()=>answer("tap")}>{now>=state.challenge.readyAt?"TAP NOW!":"WAIT…"}</button>
      :engine==="roulette"?<div className={styles.markets}>{markets.map(m=><button key={m.label} disabled={locked} onClick={()=>{if(!Number.isSafeInteger(amount)||amount<1)return;if(!Number.isSafeInteger(total+amount)||BigInt(total+amount)>BigInt(balance)){setError("Not enough coins for this bet.");return;}setBets({...bets,[m.label]:(bets[m.label]||0)+amount});}}><b>{m.label}</b><small>{m.payout}</small><span>{Number(state?.myTotals?.[m.label]||0)+(bets[m.label]||0)} coins</span></button>)}</div>
      :<div className={engine==="teenpatti"?styles.sharedHands:styles.miniChoices}>{options.map((opt,i)=><button key={opt} disabled={locked} aria-pressed={choice===opt} data-winner={outcome?.winners?.includes(opt)||false} onClick={()=>setChoice(opt)}>{engine==="teenpatti"?<><small>HAND {opt}</small><span className={styles.threeCards}>{(outcome?.hands?.[i]?.cards||["?","?","?"]).map((card,j)=><i key={j}>{card}</i>)}</span><small>{outcome?.hands?.[i]?.label||"Hidden cards"}</small><small>{state?.totals?.[opt]||0} coins</small></>:opt}</button>)}</div>}
     {phase==="open"&&<PointAmount game={game} balance={engine==="roulette"?String(BigInt(balance)-BigInt(total)):balance} value={amount} custom={custom} disabled={busy||!!pending} onChange={(n,c)=>{setAmount(n);setCustom(c);}}/>}
     <div className={styles.actions}><span>{mine?mine.answered?"Answer saved":"Bet placed":phase==="open"?"Choose your bet":"Bets closed"}<b>{state?.myTotal||0} coins this round</b></span>{engine==="roulette"&&!locked&&<button onClick={()=>setBets({})}>Clear</button>}{(!["teenpatti","pizza"].includes(engine)||pending)&&<button className={styles.play} disabled={busy||(!pending&&(locked||phase!=="open"||!game||!Number.isSafeInteger(total)||total<1||BigInt(total)>BigInt(balance)||(!timed&&engine!=="roulette"&&options.length>1&&!choice)))} onClick={()=>enter()}>{pending?"Retry placement":"Place bet"}</button>}</div>
   </div>
   </div>
   <footer className={styles.footer}><span><b>{BigInt(balance).toLocaleString()}</b> {currency}</span>{preview&&<button disabled={busy||!!pending} onClick={refill}>Refill practice coins</button>}<RoundResults state={state} ready={engine!=="roulette"||wheelReady===roundKey}/>{preview&&<small>Practice coins</small>}</footer>
   <dialog ref={dialog} className={styles.help} onClose={()=>setHelp(false)}><header><h2>{game?.name} rules</h2><button onClick={()=>setHelp(false)} aria-label="Close rules">×</button></header><GameRules game={game}/></dialog>
 </section>;
}
