'use client';
import {useEffect,useRef,useState} from 'react';
import GreedyFood from './greedy-food';
import PizzaFood from './pizza-food';
import styles from './greedy.module.css';
import pizzaStyles from './pizza.module.css';
const coins=n=>BigInt(n??0).toLocaleString();
export default function GreedyControls({state,amount,phase,locked,onAuto,request,headerBalance,onRules}){
 const engine=state?.game?.engine||'greedy',Food=engine==='pizza'?PizzaFood:GreedyFood;
 const headerStyles=engine==='pizza'?pizzaStyles:styles;
 const [auto,setAuto]=useState(false),[notice,setNotice]=useState(''),[view,setView]=useState(null),[data,setData]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 const attempted=useRef(null),dialog=useRef(null),call=useRef(onAuto),version=useRef(0);
 call.current=onAuto;
 useEffect(()=>{const stop=()=>{if(document.hidden){setAuto(false);setNotice('Auto Play stopped when you left the game.');}};document.addEventListener('visibilitychange',stop);window.addEventListener('pagehide',stop);return()=>{document.removeEventListener('visibilitychange',stop);window.removeEventListener('pagehide',stop);};},[]);
 useEffect(()=>{
  if(!auto||!state)return;
  if(state.acceptingBets===false){setAuto(false);setNotice('Auto Play stopped: betting paused.');return;}
  if(phase!=='open'||locked)return;
  if(!Number.isSafeInteger(amount)||amount<1||!Number.isSafeInteger(amount*6)||BigInt(amount)*6n>BigInt(state.availableCoins??state.availablePoints??0)){
   setAuto(false);setNotice('Auto Play stopped: not enough coins for all six spots.');return;
  }
  const key=`${state.dayId}:${state.slot}`;
  if(attempted.current===key)return;
  attempted.current=key;
  void call.current().then(ok=>{if(!ok){setAuto(false);setNotice('Auto Play stopped: placement was not confirmed.');}});
 },[auto,state,amount,phase,locked]);
 useEffect(()=>{if(view)dialog.current?.showModal();else dialog.current?.close();},[view]);
 async function load(kind,page=0){
  const current=++version.current;setView(kind);setLoading(true);setError('');
  try{const result=await request({action:`${engine}-${kind}`,gameId:state.game.id,page});if(version.current===current)setData(result);}
  catch(e){if(version.current===current)setError(e.message);}finally{if(version.current===current)setLoading(false);}
 }
 return <>
  {headerBalance!==undefined?<header className={headerStyles.gameHeader} aria-label={`${engine} game controls`}>
   <button className={headerStyles.headerActivity} onClick={()=>{setData(null);void load('ranking');}}><img src="/games/common/coins.webp" alt=""/><span>Ranking</span></button>
   <span className={headerStyles.balance} aria-label={`${coins(headerBalance)} coins`}><img src={engine==='pizza'?'/games/pizza/coin.webp':'/games/common/coins.webp'} alt=""/>{coins(headerBalance)}</span>
   <button className={headerStyles.headerActivity} onClick={()=>{setData(null);void load('history');}}><img src="/games/greedy/history-v2.webp" alt=""/><span>My History</span></button>
   <button className={headerStyles.headerRules} onClick={onRules} aria-label="Game rules">?</button>
  </header>:<div className={`${styles.activityButtons} food-game-activity`}><button onClick={()=>{setData(null);void load('ranking');}}><img src="/games/common/coins.webp" alt=""/><span>Ranking<small>Past 24 hours</small></span></button><button onClick={()=>{setData(null);void load('history');}}><img src="/games/greedy/history-v2.webp" alt=""/><span>My History<small>Past 24 hours</small></span></button></div>}
  <div className={`${styles.autoBar} food-game-auto`}><span>{auto?'Six random spots each round':'Random bets on six spots'}<small>{Number.isSafeInteger(amount)&&amount>0?`${coins(amount)} each · ${coins(BigInt(amount)*6n)} per round`:'Choose a coin amount'}</small></span><button className={styles.autoButton} aria-pressed={auto} onClick={()=>{setAuto(!auto);setNotice('');}}>{auto?'Stop Auto Play':'Auto Play'}</button></div>
  {notice&&<p className={styles.autoNotice} role="status">{notice}</p>}
  <dialog ref={dialog} className={styles.activityDialog} onClose={()=>{version.current++;setView(null);setData(null);}} aria-label={view==='ranking'?`${engine} ranking`:`My ${engine} history`}><header><h2>{view==='ranking'?'Ranking':'My History'}</h2><button aria-label="Close activity" onClick={()=>dialog.current?.close()}>×</button></header><p>Past 24 hours{view==='ranking'?' · Coins returned, including winning stakes':''}</p>
   {loading?<p role="status">Loading…</p>:error?<p role="alert">{error} <button onClick={()=>load(view,data?.page??0)}>Retry</button></p>:<>
   {!data?.rows?.length&&<p>No activity in the past 24 hours.</p>}
   {view&&data?.rows?.map((row,i)=>view==='ranking'?<div className={styles.activityRow} key={row.publicId}><span>#{i+1}</span><div><b>{row.name}</b><small>{row.publicId}</small></div><strong>{coins(row.payout)} coins</strong></div>:<div className={styles.activityRow} key={row.id}><div><b>Round {row.roundNumber}</b><small>{new Date(row.createdAt).toLocaleString()}</small><span>{Object.keys(row.input.bets||{[row.input.choice]:row.amount}).map(id=><Food key={id} food={id}/>)}</span></div><div><small>Bet {coins(row.amount)}</small><b>{row.status==='SETTLED'?`Returned ${coins(row.result?.payout)}`:row.status}</b><span>{row.result?.winners?.map(id=><Food key={id} food={id}/>)}</span></div></div>)}
   {view==='history'&&<nav>{data?.page>0&&<button onClick={()=>load(view,data.page-1)}>Previous</button>}{data?.hasMore&&<button onClick={()=>load(view,data.page+1)}>Next</button>}</nav>}
   </>}
  </dialog>
 </>;
}
