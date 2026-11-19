"use client";
import {createFoodTapQueue} from "@/lib/game-control/food-tap-queue.mjs";
import {useGameLoading} from "./game-loading";
import RoundResults from "./round-results";
import {roundSummary} from "@/lib/game-control/round-summary.mjs";
import {useCallback,useEffect,useRef,useState} from "react";
import RouletteWheel from "./roulette-wheel";
import GameRules from "./game-rules";
import {api} from "./store";
import {miniGames} from "@/lib/game-control/mini-games.mjs";
import {markets} from "@/lib/game-control/roulette/engine.mjs";
import PointAmount from "./point-amount";
import greedyStyles from "./greedy.module.css";
import GreedyWheel from "./greedy-wheel";
import GreedyScenery from "./greedy-scenery";
import GreedyFood from "./greedy-food";
import GreedyControls from "./greedy-controls";
import PizzaWheel from "./pizza-wheel";
import PizzaFood from "./pizza-food";
import pizzaStyles from "./pizza.module.css";
import TeenPattiTable from "./teen-patti-table";
import TeenPattiAuto from "./teen-patti-auto";
import TeenPattiIcon from "./teen-patti-icon";
import teenStyles from "./teen-patti.module.css";
import MiniGameAnimation from "./mini-game-animation";
import InstantStage from "./instant-stage";
import FlipStage from "./flip-stage";
import {instantGames} from "@/lib/game-control/instant-games.mjs";
import styles from "./play-panel-utilities";

export default function SharedPlayer({gameId,preview=false}){
 const request=useCallback(body=>preview?api("admin",{action:"preview-round",request:{...body,gameId}}):api("player",body),[preview,gameId]);
 const [state,setState]=useState(null),[error,setError]=useState(""),[now,setNow]=useState(0),[busy,setBusy]=useState(false);
 const [amount,setAmount]=useState(100),[custom,setCustom]=useState(false),[choice,setChoice]=useState(""),[bets,setBets]=useState({}),[answers,setAnswers]=useState([]),[question,setQuestion]=useState(0);
 const [wheelReady,setWheelReady]=useState(null),[greedyReady,setGreedyReady]=useState(null);
 const [pending,setPending]=useState(null),[help,setHelp]=useState(false);
 const offset=useRef(0),lastRound=useRef(""),guard=useRef(false),dialog=useRef(null),polling=useRef(false);
 const activeEntry=useRef(null),tapQueue=useRef(null),refreshRef=useRef(null),retryEntry=useRef(null);
 const [queuedTaps,setQueuedTaps]=useState([]);
 const load=useCallback(async()=>{
   if(polling.current)return;polling.current=true;
   try{const s=await request({action:"shared-state",gameId});offset.current=s.serverTime-Date.now();setNow(s.serverTime);setState(s);setError("");tapQueue.current?.reconcile((s.mineEntries||[]).map(e=>e.id),s.dayId,s.slot);
     const key=`${s.dayId}:${s.slot}`;if(lastRound.current!==key){lastRound.current=key;setChoice("");setBets({});setAnswers([]);setQuestion(0);setPending(null);}
     setPending(p=>p&&(s.mineEntries||[]).some(e=>e.id===p.id)?null:p);
     if(activeEntry.current!==s.mine?.id){activeEntry.current=s.mine?.id;setQuestion(0);setAnswers([]);}
   }finally{polling.current=false;}
 },[gameId,request]);
 useEffect(()=>{refreshRef.current=load;},[load]);
 useEffect(()=>{
  const queue=createFoodTapQueue({send:request,onChange:setQueuedTaps,onError:setError,refresh:()=>refreshRef.current()});
  tapQueue.current=queue;
  return()=>{queue.stop();tapQueue.current=null;};
 },[request]);
 useEffect(()=>{let alive=true;const poll=()=>{if(document.hidden)return;load().catch(e=>{if(alive)setError(e.message);});};poll();const timer=setInterval(poll,2000),tick=setInterval(()=>setNow(Date.now()+offset.current),["pizza","greedy"].includes(state?.game?.engine)?1000:100);document.addEventListener("visibilitychange",poll);return()=>{alive=false;clearInterval(timer);clearInterval(tick);document.removeEventListener("visibilitychange",poll);};},[load,state?.game?.engine]);
 useEffect(()=>{if(help)dialog.current?.showModal();else dialog.current?.close();},[help]);
 const launchReady=useGameLoading(!!state,error);
 const game=state?.game,engine=game?.engine,mine=state?.mine;
 const foodGame=["greedy","pizza"].includes(engine),Food=engine==="pizza"?PizzaFood:GreedyFood;
 const balance=state?.availableCoins??state?.availablePoints??"0";
 const currency=preview?"practice coins":"coins";
 const phase=!state?"loading":now>=state.endsAt?"reset":now>=state.revealsAt?"reveal":now>=state.closesAt?"playing":"open";
 const remaining=state?Math.max(0,Math.ceil(((phase==="open"?state.closesAt:phase==="playing"?state.revealsAt:phase==="reset"&&state.phase==="reset"?state.resetAt:state.endsAt)-now)/1000)):0;
 const total=engine==="roulette"?Object.values(bets).reduce((a,b)=>a+b,0):amount;
 const options=["pizza","greedy","teenpatti"].includes(engine)?[]:engine==="flip"?["heads","tails"]:miniGames[engine]?.choices||[];
 const timed=["reaction","trivia"].includes(engine);
 const locked=busy||!!pending||(!foodGame&&!!error)||state?.acceptingBets===false||phase!=="open";
 async function enter(selectedChoice,auto=false){
   if(guard.current||!state)return;guard.current=true;setBusy(true);setError("");
   const payload=pending||{action:"shared-enter",id:crypto.randomUUID(),gameId,dayId:state.dayId,slot:state.slot,amount:total,custom,...(auto?{auto:true}:{}),choice:typeof selectedChoice==="string"?selectedChoice:choice||(options.length===1?options[0]:""),bets:engine==="roulette"?bets:undefined};
   try{setPending(payload);await request(payload);setPending(null);setBets({});await load();return true;}catch(e){if(e.status&&e.status<500)setPending(null);setError(e.message);return false;}finally{guard.current=false;setBusy(false);}
 }
 useEffect(()=>{retryEntry.current=enter;});
 useEffect(()=>{
  if(!foodGame||!pending||busy)return;
  const timer=setTimeout(()=>{void retryEntry.current();},1500);
  return()=>clearTimeout(timer);
 },[foodGame,pending,busy]);
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
 const unconfirmed=queuedTaps.filter(p=>p.dayId===state?.dayId&&p.slot===state?.slot&&!(state?.mineEntries||[]).some(e=>e.id===p.id));
 const visibleTotals={...state?.myTotals};
 for(const p of unconfirmed)visibleTotals[p.choice]=String(BigInt(visibleTotals[p.choice]||0)+BigInt(p.amount));
 function placeChoice(value){
  if(locked)return;
  if(foodGame){
   const queue=tapQueue.current;if(!queue||Date.now()+offset.current>=state.closesAt)return;
   const outstanding=queue.pending().filter(p=>!(state.mineEntries||[]).some(e=>e.id===p.id));
   const selections=new Set(Object.keys(state.myTotals||{}).filter(k=>BigInt(state.myTotals[k])>0n));
   for(const p of outstanding.filter(p=>p.dayId===state.dayId&&p.slot===state.slot))selections.add(p.choice);
   if(!selections.has(value)&&selections.size>=6){setError('You can bet on at most 6 foods per round.');return;}
   const reserved=outstanding.reduce((sum,p)=>sum+BigInt(p.amount),0n);
   if(!Number.isSafeInteger(amount)||amount<1||reserved+BigInt(amount)>BigInt(balance)){setError('Not enough coins for this bet.');return;}
   setChoice(value);setError('');
   queue.add({action:'shared-enter',id:crypto.randomUUID(),gameId,dayId:state.dayId,slot:state.slot,amount,custom,choice:value});
   return;
  }
  if(engine==='teenpatti'&&Object.keys(state.myTotals||{}).length>=2&&!BigInt(state.myTotals?.[value]||0))return;
  setChoice(value);void enter(value);
 }
 return <section className={`${styles.panel} ${engine==="pizza"?pizzaStyles.panel:engine==="greedy"?greedyStyles.panel:""} ${engine==="roulette"?"roulette-design":""} ${engine==="teenpatti"?`${styles.teenPanel} ${teenStyles.panel}`:""}`} aria-label="Shared room coin game">
   {engine==="greedy"&&<GreedyScenery/>}
   {(foodGame||engine==="teenpatti")?<GreedyControls hideAuto={engine==="teenpatti"} state={state} amount={amount} phase={phase} locked={locked||queuedTaps.length>0} onAuto={()=>enter(undefined,true)} request={request} headerBalance={balance} onRules={()=>setHelp(true)}/>:<header className={styles.header}><div><h1>{engine==="pizza"?<img className={pizzaStyles.logo} src="/games/pizza/logo.webp" alt="Pizza"/>:game?.name||"Connecting…"}</h1>{foodGame&&engine!=="pizza"?<small className={greedyStyles.round}>round: {state?.roundNumber}</small>:<div className={styles.roundHistory} aria-label="Recent results">{state?.history?.slice(0,5).map(h=><span key={h.roundNumber} title={`Round ${h.roundNumber}`}>{engine==="reaction"?"✓":String(h.result??"✓")}</span>)}</div>}</div>{engine==="pizza"&&<span className={pizzaStyles.balance}><img src="/games/pizza/coin.webp" alt=""/>{BigInt(balance).toLocaleString()}</span>}<button onClick={()=>setHelp(true)} aria-label="Game rules">?</button></header>}
   <div className={styles.stage}>
     {engine==="greedy"&&<small className={greedyStyles.stageRound}>Round {state?.roundNumber}</small>}
     {engine==="roulette"?<RouletteWheel roundKey={roundKey} playing={waiting} result={outcome?.result} onSettled={setWheelReady}/>
      :instantGames[engine]?<div className="shared-game-visuals"><InstantStage engine={engine==="highlow"?"dice":engine} busy={waiting} result={visualResult} choice={latest?.input.choice||choice||options[0]}/></div>
      :engine==="teenpatti"?<TeenPattiTable phase={phase} remaining={remaining} outcome={outcome} totals={state?.totals} myTotals={state?.myTotals} mine={mine} onPlace={placeChoice} disabled={locked} roundNumber={state?.roundNumber}/>
      :engine==="flip"?<div className="shared-game-visuals"><FlipStage busy={waiting} result={visualResult} choice={latest?.input.choice||choice||"heads"}/></div>
      :engine==="greedy"?<GreedyWheel key={roundKey} duration={state.revealsAt-state.closesAt} onSettled={setGreedyReady} game={game} choice={latest?.input.choice||choice} onChoose={placeChoice} disabled={locked} result={outcome?.result} playing={waiting||(phase==="reveal"&&!outcome)} elapsed={Math.max(0,now-state.closesAt)} countdown={phase==="open"||phase==="playing"?remaining:0} myTotals={visibleTotals} totals={state?.totals} latest={latest} winners={outcome?.winners} bonus={outcome?.bonus} roundKey={roundKey}/>
      :engine==="pizza"?<PizzaWheel roundNumber={state?.roundNumber} key={roundKey} duration={state.revealsAt-state.closesAt} onSettled={setGreedyReady} game={game} choice={latest?.input.choice||choice} onChoose={placeChoice} disabled={locked} result={outcome?.result} playing={waiting||(phase==="reveal"&&!outcome)} elapsed={Math.max(0,now-state.closesAt)} countdown={phase==="open"||phase==="playing"?remaining:0} myTotals={visibleTotals} totals={state?.totals} latest={latest} winners={outcome?.winners} bonus={outcome?.bonus} roundKey={roundKey}/>
      :engine?<MiniGameAnimation engine={engine} phase={outcome?"revealed":waiting?"playing":"idle"} round={animationRound} choice={latest?.input.choice||choice} challenge={state?.challenge?{...state.challenge,expiresAt:state.revealsAt}:null} now={now}/>:null}
   </div>
   <div className={engine==="roulette"?"roulette-betting-panel":"shared-betting-contents"}>
   {foodGame&&<div className={greedyStyles.history} aria-label="Recent results"><small>result</small>{state?.history?.slice(0,8).map((h,i)=><span key={h.roundNumber} title={`Round ${h.roundNumber}`}><span className={greedyStyles.historyFoods}>{(h.winners||[h.result]).map(id=><Food key={id} food={id}/>)}</span>{i===0&&<em>NEW</em>}</span>)}</div>}
   <div className={styles.status} role="status">{engine==="roulette"&&<span className="roulette-timer-icon"/>}{error||`${state?.acceptingBets===false?"Betting paused":phase==="open"?"Place your bets":phase==="playing"?"Playing":phase==="reveal"?"Results":"Next round"}${foodGame?"":` · ${remaining}s`}`}</div>
   <div className={styles.table}>
     {engine==="pizza"&&<div className={pizzaStyles.bonusIndicators} aria-label="Bonus indicators — not betting spots"><span data-active={outcome?.bonus==="salad"}><img src="/games/pizza/salad.webp" alt="Salad"/></span><span data-active={outcome?.bonus==="pizza"}><img src="/games/pizza/pizza.webp" alt="Pizza"/></span></div>}
     {engine==="trivia"&&phase==="playing"&&quiz&&mine&&!mine.answered?<><p className={styles.question}>{question+1}/{state.challenge.questions.length} · {quiz.text}</p><div className={styles.miniChoices}>{quiz.options.map((text,i)=><button key={i} disabled={busy} onClick={()=>answer(String(i))}>{text}</button>)}</div></>
      :engine==="reaction"&&phase==="playing"&&state?.challenge&&mine&&!mine.answered?<button className={`${styles.reactionPad} ${now>=state.challenge.readyAt?styles.go:""}`} disabled={busy} onClick={()=>answer("tap")}>{now>=state.challenge.readyAt?"TAP NOW!":"WAIT…"}</button>
      :engine==="roulette"?<div className={styles.markets}>{markets.map(m=><button key={m.label} disabled={locked} onClick={()=>{if(!Number.isSafeInteger(amount)||amount<1)return;if(!Number.isSafeInteger(total+amount)||BigInt(total+amount)>BigInt(balance)){setError("Not enough coins for this bet.");return;}setBets({...bets,[m.label]:(bets[m.label]||0)+amount});}}><b>{m.label}</b><small>{m.payout}</small><span>{Number(state?.myTotals?.[m.label]||0)+(bets[m.label]||0)} coins</span></button>)}</div>
      :<div className={engine==="teenpatti"?styles.sharedHands:styles.miniChoices}>{options.map((opt,i)=><button key={opt} disabled={locked} aria-pressed={choice===opt} data-winner={outcome?.winners?.includes(opt)||false} onClick={()=>setChoice(opt)}>{engine==="teenpatti"?<><small>HAND {opt}</small><span className={styles.threeCards}>{(outcome?.hands?.[i]?.cards||["?","?","?"]).map((card,j)=><i key={j}>{card}</i>)}</span><small>{outcome?.hands?.[i]?.label||"Hidden cards"}</small><small>{state?.totals?.[opt]||0} coins</small></>:opt}</button>)}</div>}
     {engine==="pizza"&&<div className={pizzaStyles.steps}><b>① Select Amount</b><b>② Select Food</b></div>}{<PointAmount game={game} balance={engine==="roulette"?String(BigInt(balance)-BigInt(total)):balance} value={amount} custom={custom} disabled={busy||!!pending||(!foodGame&&phase!=="open")} onChange={(n,c)=>{setAmount(n);setCustom(c);}}/>}
     <div className={styles.actions}><span>{mine?mine.answered?"Answer saved":"Bet placed":phase==="open"?"Choose your bet":"Bets closed"}<b>{state?.myTotal||0} coins this round{foodGame&&` · ${Object.keys(state?.myTotals||{}).length}/6 foods`}{engine==="teenpatti"&&` · ${Object.keys(state?.myTotals||{}).length}/2 hands`}</b></span>{engine==="roulette"&&!locked&&<button onClick={()=>setBets({})}>Clear</button>}{(!["teenpatti","pizza","greedy"].includes(engine)||(!foodGame&&pending))&&<button className={styles.play} disabled={busy||(!pending&&(locked||phase!=="open"||!game||!Number.isSafeInteger(total)||total<1||BigInt(total)>BigInt(balance)||(!timed&&engine!=="roulette"&&options.length>1&&!choice)))} onClick={()=>enter()}>{pending?"Retry placement":"Place bet"}</button>}</div>
   </div>
   </div>
   {engine==="teenpatti"&&<div className={teenStyles.history} aria-label="Recent results"><small>Result</small>{state?.history?.slice(0,8).map(h=><span key={h.roundNumber} title={`Round ${h.roundNumber}`} >{(h.winners||[h.result]).map(id=><TeenPattiIcon key={id} food={id}/>)}</span>)}</div>}
   {engine==="teenpatti"&&<TeenPattiAuto state={state} amount={amount} phase={phase} locked={locked||queuedTaps.length>0} onAuto={()=>enter(undefined,true)}/>}
   <footer className={styles.footer}><span><b>{BigInt(balance).toLocaleString()}</b> {currency}</span>{preview&&<button disabled={busy||!!pending} onClick={refill}>Refill practice coins</button>}<RoundResults state={state} ready={launchReady&&(foodGame?greedyReady===roundKey:engine!=="roulette"||wheelReady===roundKey)}/>{preview&&<small>Practice coins</small>}</footer>
   <dialog ref={dialog} className={styles.help} onClose={()=>setHelp(false)}><header><h2>{game?.name} rules</h2><button onClick={()=>setHelp(false)} aria-label="Close rules">×</button></header><GameRules game={game}/></dialog>
 </section>;
}
