'use client';
import {useEffect,useRef,useState} from 'react';
import styles from './teen-patti.module.css';
export default function TeenPattiAuto({state,amount,phase,locked,onAuto}){
 const [enabled,setEnabled]=useState(false),[notice,setNotice]=useState('');
 const attempted=useRef(null);
 useEffect(()=>{
  const stop=()=>{if(document.hidden){setEnabled(false);setNotice('Auto Play stopped when you left the game.');}};
  document.addEventListener('visibilitychange',stop);
  return()=>document.removeEventListener('visibilitychange',stop);
 },[]);
 useEffect(()=>{
  if(!enabled||!state)return;
  const timer=setTimeout(()=>{
  if(state.acceptingBets===false){setEnabled(false);setNotice('Auto Play stopped: betting paused.');return;}
  if(phase!=='open'||locked)return;
  const key=`${state.dayId}:${state.slot}`;
  if(attempted.current===key)return;
  // Start on the next untouched round if manual bets have already been placed.
  if(Object.keys(state.myTotals||{}).length){attempted.current=key;setNotice('Auto Play starts next round.');return;}
  if(!Number.isSafeInteger(amount)||amount<1||!Number.isSafeInteger(amount*2)||BigInt(amount)*2n>BigInt(state.availableCoins??state.availablePoints??0)){
   setEnabled(false);setNotice('Auto Play stopped: not enough coins for two hands.');return;
  }
  attempted.current=key;setNotice('');
  void onAuto().then(ok=>{if(!ok){setEnabled(false);setNotice('Auto Play stopped: placement was not confirmed.');}});
  },0);
  return()=>clearTimeout(timer);
 },[enabled,state,amount,phase,locked,onAuto]);
 return <div className={styles.autoBar}><span role="status">{notice||`${amount.toLocaleString()} each · ${(amount*2).toLocaleString()} per round · 2 random hands`}</span><button type="button" aria-pressed={enabled} onClick={()=>{setEnabled(!enabled);setNotice('');}}>{enabled?'Stop Auto Play':'Auto Play'}</button></div>;
}
