'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {roundSummary} from '@/lib/game-control/round-summary.mjs';
import {resultColor} from '@/lib/game-control/roulette/original-rules.mjs';
import PizzaFood from './pizza-food';
import GreedyFood from './greedy-food';
import styles from "./play-panel-utilities";
const coins=n=>BigInt(n??0).toLocaleString();
export default function RoundResults({state,ready=true}){
 const ref=useRef(null),timer=useRef(null),[saved,setSaved]=useState(null);
 const foodGame=['greedy','pizza'].includes(state?.game?.engine);
 const key=state?.outcome?`${state.dayId}:${state.slot}`:null;
 if(key&&saved!==state)setSaved(state);
 const open=useCallback((automatic=false)=>{
  clearTimeout(timer.current);if(ref.current&&!ref.current.open)ref.current.showModal();
  if(automatic||foodGame)timer.current=setTimeout(()=>ref.current?.close(),foodGame?3000:4000);
 },[foodGame]);
 useEffect(()=>{if(key&&ready)open(true);},[key,ready,open]);
 useEffect(()=>()=>clearTimeout(timer.current),[]);
 const summary=roundSummary(saved?.mineEntries),roulette=saved?.game?.engine==='roulette';
 return <><button type="button" disabled={!saved||!ready} onClick={()=>open(false)}>Results</button><dialog ref={ref} className={`${styles.help} ${styles.resultSheet}`} aria-label="Round results" onClose={()=>clearTimeout(timer.current)}>
  <header><h2>Round results</h2><button aria-label="Close results" onClick={()=>ref.current?.close()}>×</button></header>
  {!foodGame&&<><div className={styles.resultHero} data-color={roulette?resultColor(saved?.outcome?.result):undefined}><strong>{['greedy','pizza'].includes(saved?.game?.engine)?<>{(saved?.outcome?.winners||[saved?.outcome?.result]).map(food=>saved?.game?.engine==='pizza'?<PizzaFood key={food} food={food}/>:<GreedyFood key={food} food={food} large/>)}</>:String(saved?.outcome?.result??'Round complete')}</strong><span>{roulette?resultColor(saved?.outcome?.result):saved?.game?.name}</span></div>
  {summary.count>0?<><div className={styles.resultTotals}><div><small>Bet</small><b>{coins(summary.wager)}</b></div><div><small>Returned</small><b>{coins(summary.payout)}</b></div><div><small>Net</small><b>{BigInt(summary.net)>0n?'+':''}{coins(summary.net)}</b></div></div>{summary.pending>0&&<p role="status">Confirming your return…</p>}</>:<p className={styles.noBet}>No bets placed this round</p>}
  {!!saved?.winners?.length&&<details className={styles.winnerList}><summary>Top winners</summary>{saved.winners.slice(0,10).map(w=><p key={w.publicId}><b>{w.name}</b><span>+{coins(w.payout)}</span></p>)}</details>}
  </>}
  {foodGame&&<>
   <div className={styles.resultTotals} style={{gridTemplateColumns:"repeat(2,minmax(0,1fr))"}}>
    <div><small>This Round Earning</small><b>{summary.pending?"Confirming…":coins(summary.payout)}</b></div>
    <div><small>This Round Cost</small><b>{coins(summary.wager)}</b></div>
   </div>
   <section className={styles.winnerList} aria-label="Top 3 winners">
    <h3>Top 3 winners</h3>
    {saved?.winners?.length?saved.winners.slice(0,3).map((w,i)=><p key={w.publicId}><b>{i+1}. {w.name||w.publicId}</b><span>+{coins(w.payout)}</span></p>):<p>{saved?.winnersPending?"Confirming winners…":"No winners this round"}</p>}
   </section>
  </>}
  {!foodGame&&<button className={styles.resultDone} onClick={()=>ref.current?.close()}>Continue</button>}
 </dialog></>;
}
