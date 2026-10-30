'use client';
import {useEffect,useRef,useState} from 'react';
import {wheelOrder,resultColor} from '@/lib/game-control/roulette/original-rules.mjs';
import {rouletteLandingAngle,ROULETTE_LANDING_MS,ROULETTE_RESULT_HOLD_MS} from '@/lib/game-control/roulette/motion.mjs';
import styles from './roulette-wheel.module.css';
function Wheel({rotor,result,landed}) {
 const point=(radius,degrees)=>{const a=(degrees-90)*Math.PI/180;return `${200+radius*Math.cos(a)},${200+radius*Math.sin(a)}`;};
 const step=360/wheelOrder.length;
 return <div className={styles.wheel}>
  <div className={styles.rotor} ref={rotor}><svg viewBox="0 0 400 400" role="img" aria-label={landed?`Winning number ${result}`:'European roulette wheel'}>
   <circle cx="200" cy="200" r="196" fill="#b68c37" stroke="#ffe6a1" strokeWidth="5"/>
   {wheelOrder.map((n,i)=><g key={n}>
    <path d={`M200,200 L${point(187,i*step-step/2)} A187,187 0 0,1 ${point(187,i*step+step/2)} Z`} fill={resultColor(n)==='Red'?'#b52c3e':n===0?'#13865c':'#122c2b'} stroke="#dfc178" strokeWidth=".7"/>
    <text x="200" y="36" transform={`rotate(${i*step} 200 200)`} textAnchor="middle" dominantBaseline="middle" fill="#fff4d4" fontSize="14" fontWeight="700">{n}</text>
   </g>)}
   <circle cx="200" cy="200" r="135" fill="#164a3d" stroke="#e9cb7c" strokeWidth="4"/>
   <circle cx="200" cy="200" r="118" fill="#082f29" stroke="#bb9850" strokeWidth="2"/>
   {Array.from({length:8},(_,i)=><path key={i} d="M200 86L200 143" transform={`rotate(${i*45} 200 200)`} stroke="#c8a762" strokeWidth="4"/>)}
   <circle cx="200" cy="200" r="55" fill="#c09b4e" stroke="#ffe4a1" strokeWidth="5"/>
   <circle cx="200" cy="200" r="40" fill="#234738" stroke="#846227" strokeWidth="3"/>
  </svg></div>
  <div className={styles.pointer} aria-hidden="true"/>
  <div className={styles.hub} data-landed={landed}>{landed?result:'♛'}</div>
 </div>;
}
export default function RouletteWheel({roundKey,playing,result,onSettled}) {
 const small=useRef(null),large=useRef(null),dialog=useRef(null),angle=useRef(0),startedRound=useRef(null),callback=useRef(onSettled);
 const [landedKey,setLandedKey]=useState(null);
 useEffect(()=>{callback.current=onSettled;},[onSettled]);
 useEffect(()=>{
  if(!playing&&result==null&&startedRound.current!==roundKey){dialog.current?.close();return;}
  startedRound.current=roundKey;
  if(landedKey===roundKey)return;
  const modal=dialog.current;
  if(modal&&!modal.open)modal.showModal();
  const nodes=[small.current,large.current].filter(Boolean),reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  let timer,cancelled=false,spinning=false;const animations=[];
  const paint=a=>{angle.current=a;for(const node of nodes)node.style.transform=`rotate(${a}deg)`;};
  const base=angle.current;
  if(result==null){
   // Compositor animations keep moving when polling or the WebView's main thread is busy.
   if(!reduced){
    spinning=true;
    for(const node of nodes)animations.push(node.animate([{transform:`rotate(${base}deg)`},{transform:`rotate(${base+360}deg)`}],{duration:1440,iterations:Infinity,easing:'linear'}));
   }
  }else{
   const target=rouletteLandingAngle(angle.current,result),duration=reduced?0:ROULETTE_LANDING_MS;
   for(const node of nodes)animations.push(node.animate([{transform:`rotate(${angle.current}deg)`},{transform:`rotate(${target}deg)`}],{duration,easing:'cubic-bezier(.12,.7,.18,1)',fill:'forwards'}));
   Promise.all(animations.map(a=>a.finished)).then(()=>{
    if(cancelled)return;paint(target);setLandedKey(roundKey);
    timer=setTimeout(()=>{modal?.close();callback.current(roundKey);},ROULETTE_RESULT_HOLD_MS);
   }).catch(()=>{});
  }
  return()=>{
   cancelled=true;clearTimeout(timer);
   if(spinning)paint(base+Number(animations[0]?.currentTime??0)/4);
   for(const animation of animations)animation.cancel();
  };
 // landedKey is deliberately not a dependency: finishing must not cancel the result hold timer.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[roundKey,playing,result]);
 useEffect(()=>{const modal=dialog.current;return()=>modal?.close();},[]);
 const landed=landedKey===roundKey;
 return <><Wheel rotor={small} result={result} landed={landed}/><dialog ref={dialog} className={styles.spotlight} aria-label="Roulette spin"><button className={styles.dismiss} aria-label="Minimize wheel" onClick={()=>dialog.current?.close()}>×</button><p className={styles.title}>{landed?'Winning number':'Spinning'}</p><Wheel rotor={large} result={result} landed={landed}/><p className={styles.caption} aria-live="polite">{landed?`${result} · ${resultColor(result)}`:'Bets closed'}</p></dialog></>;
}
