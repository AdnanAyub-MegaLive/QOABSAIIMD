'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {roundSummary} from '@/lib/game-control/round-summary.mjs';
import {resultColor} from '@/lib/game-control/roulette/original-rules.mjs';
import styles from "./play-panel-utilities";
const coins=n=>BigInt(n??0).toLocaleString();
export default function RoundResults({state,ready=true}){
 const ref=useRef(null),timer=useRef(null),[saved,setSaved]=useState(null);
 const key=state?.outcome?`${state.dayId}:${state.slot}`:null;
 if(key&&saved!==state)setSaved(state);
 const open=useCallback((automatic=false)=>{
  clearTimeout(timer.current);if(ref.current&&!ref.current.open)ref.current.showModal();
  if(automatic)timer.current=setTimeout(()=>ref.current?.close(),4000);
 },[]);
 useEffect(()=>{if(key&&ready)open(true);},[key,ready,open]);
 useEffect(()=>()=>clearTimeout(timer.current),[]);
 const summary=roundSummary(saved?.mineEntries),roulette=saved?.game?.engine==='roulette';
 return <><button type="button" disabled={!saved||!ready} onClick={()=>open(false)}>Results</button><dialog ref={ref} className={`${styles.help} ${styles.resultSheet}`} aria-label="Round results" onClose={()=>clearTimeout(timer.current)}>
  <header><h2>Round results</h2><button aria-label="Close results" onClick={()=>ref.current?.close()}>×</button></header>
  <div className={styles.resultHero} data-color={roulette?resultColor(saved?.outcome?.result):undefined}><strong>{String(saved?.outcome?.result??'Round complete')}</strong><span>{roulette?resultColor(saved?.outcome?.result):saved?.game?.name}</span></div>
  {summary.count>0?<><div className={styles.resultTotals}><div><small>Bet</small><b>{coins(summary.wager)}</b></div><div><small>Returned</small><b>{coins(summary.payout)}</b></div><div><small>Net</small><b>{BigInt(summary.net)>0n?'+':''}{coins(summary.net)}</b></div></div>{summary.pending>0&&<p role="status">Confirming your return…</p>}</>:<p className={styles.noBet}>No bets placed this round</p>}
  {!!saved?.winners?.length&&<details className={styles.winnerList}><summary>Top winners</summary>{saved.winners.slice(0,10).map(w=><p key={w.publicId}><b>{w.name}</b><span>+{coins(w.payout)}</span></p>)}</details>}
  <button className={styles.resultDone} onClick={()=>ref.current?.close()}>Continue</button>
 </dialog></>;
}
