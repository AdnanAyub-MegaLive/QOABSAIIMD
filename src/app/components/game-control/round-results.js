"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {roundSummary} from '@/lib/game-control/round-summary.mjs';
import styles from './play-panel.module.css';
const coins=n=>BigInt(n??0).toLocaleString();
export default function RoundResults({state}){
 const ref=useRef(null),closeTimer=useRef(null),[saved,setSaved]=useState(null);
 const key=state?.outcome?`${state.dayId}:${state.slot}`:null;
 if(key && saved!==state)setSaved(state);
 const openResults=useCallback(()=>{
  clearTimeout(closeTimer.current);
  ref.current?.showModal();
  closeTimer.current=setTimeout(()=>ref.current?.close(),3000);
 },[]);
 useEffect(()=>{
  if(key)openResults();
 },[key,openResults]);
 useEffect(()=>()=>clearTimeout(closeTimer.current),[]);
 const summary=roundSummary(saved?.mineEntries);
 return <><button type="button" disabled={!saved} onClick={openResults}>Round results</button><dialog ref={ref} className={`${styles.help} ${styles.resultSheet}`} onClose={()=>clearTimeout(closeTimer.current)} aria-label="Round results"><header><h2>Round {saved?.roundNumber} results</h2><button onClick={()=>ref.current?.close()}>Close</button></header><p>{String(saved?.outcome?.result??'Round complete')}</p><h3>Your round · {summary.count} bets</h3><p>Bet: {coins(summary.wager)} · Returned: {coins(summary.payout)} · Net: {coins(summary.net)}</p>{summary.pending>0&&<p>Settling {summary.pending} remaining bets… Totals will update.</p>}<h3>{saved?.winnersScope==='practice'?'Practice results':saved?.winnersScope==='room'?'Room winners':'Application-wide winners'}</h3><p>Returns include the original stake. Net shows profit or loss across all bets.</p>{saved?.winnersPending&&<p>Settlement is in progress; this list may change.</p>}<div className={styles.winnerList}>{saved?.winners?.map(w=><p key={w.publicId}><b>{w.name}</b> · {coins(w.payout)} returned · Net {coins(w.net)}</p>)}</div>{!saved?.winners?.length&&<p>No settled payouts yet.</p>}{saved?.winners?.length>=100&&<p>Showing the top 100 payouts.</p>}</dialog></>;
}
