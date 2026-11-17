"use client";
import {useEffect,useRef,useState} from "react";
import {greedySpinStep,greedyLandingStep} from "@/lib/game-control/greedy-motion.mjs";
import {greedyFoods,greedySettings} from '@/lib/game-control/greedy.mjs';
import GreedyFood from './greedy-food';
import styles from './greedy.module.css';
const positions=[[50,12],[77,25],[88,49],[77,74],[50,88],[23,74],[12,49],[23,25]];
export default function GreedyWheel({game={},choice,onChoose,disabled,result,playing,elapsed=0,countdown,myTotals={},totals={},latest,winners,bonus,roundKey,duration=10000,onSettled}){
 const returns=greedySettings(game).greedyReturns;
 const hot=greedyFoods.reduce((best,food)=>BigInt(totals[food.id]||0)>BigInt(totals[best]||0)?food.id:best,null);
 const step=useRef(0),[landing,setLanding]=useState(null),[settled,setSettled]=useState(false);
 const target=greedyFoods.findIndex(f=>f.id===(winners?.[0]||result));
 const currentStep=greedySpinStep(elapsed,duration);
 useEffect(()=>{if(!result&&playing)step.current=currentStep;},[result,playing,currentStep]);
 useEffect(()=>{
  if(!result||target<0)return;
  const start=step.current,begin=performance.now();let raf,timer;
  const tick=()=>{
   const progress=Math.min(1,(performance.now()-begin)/2400);
   setLanding(greedyLandingStep(start,target,progress)%8);
   if(progress<1)raf=requestAnimationFrame(tick);
   else {setSettled(true);timer=setTimeout(()=>onSettled?.(roundKey),bonus?2500:900);}
  };
  raf=requestAnimationFrame(tick);return()=>{cancelAnimationFrame(raf);clearTimeout(timer);};
 },[result,target,roundKey,onSettled,bonus]);
 const lit=result?(landing??currentStep%8):playing?currentStep%8:-1;
 return <div className={`${styles.wheel} ${bonus&&settled?styles.bonusWheel:""}`} aria-label="Greedy food wheel">
  <div className={styles.support}/><div className={styles.spokes}>{positions.map((_,i)=><i key={i} style={{transform:`rotate(${i*45}deg)`}}/>)}</div><div className={styles.hub}><img src="/games/greedy/mascot-v2.webp" alt="Greedy chef"/><strong aria-live="polite">{result&&settled?<span className={styles.hubResults}>{(winners||[result]).map(id=><GreedyFood key={id} food={id}/>)}</span>:result?'…':countdown===undefined?'GREEDY':`${countdown}s`}</strong></div>
  <div className={styles.bonusIndicators} aria-label="Bonus indicators — not betting spots"><span data-active={bonus==="salad"}><img src="/games/greedy/salad-v2.webp" alt=""/><small>Salad</small></span><span data-active={bonus==="pizza"}><img src="/games/greedy/pizza-v2.webp" alt=""/><small>Pizza</small></span></div>
  {bonus&&settled&&<div key={roundKey} className={styles.feeding} aria-label={`${bonus} bonus — ${winners?.length||0} winning foods`}><img src={`/games/greedy/${bonus}-v2.webp`} alt=""/><b>{bonus.toUpperCase()} BONUS!</b></div>}
  {greedyFoods.map((food,i)=><button type="button" key={food.id} aria-label={`${food.name}, ${returns[i]} times, ${myTotals?.[food.id]||0} coins bet`} aria-pressed={choice===food.id} disabled={disabled||!onChoose||(Object.values(myTotals).filter(n=>BigInt(n)>0n).length>=6&&!BigInt(myTotals[food.id]||0))} onClick={()=>onChoose?.(food.id)} data-winner={settled&&(winners||[result]).includes(food.id)} className={`${styles.food} ${(settled?(winners||[result]).includes(food.id):lit===i)?styles.lit:''}`} style={{left:`${positions[i][0]}%`,top:`${positions[i][1]}%`}}>
   <span className={styles.art} style={{backgroundPosition:`${i%4*100/3}% ${i<4?0:100}%`}}/>
   {settled&&(winners||[result]).includes(food.id)&&<span className={styles.winnerLabel}>WIN</span>}<b>{returns[i]}×</b>{hot===food.id&&<span className={styles.hot}>HOT</span>}<span className={styles.stallWindows} aria-hidden="true"/><em>{BigInt(myTotals?.[food.id]||0).toLocaleString()}</em>
   {(latest?.input.choice===food.id||latest?.input.bets?.[food.id])&&<span key={latest.id} className={styles.chip}>+{latest.input.bets?.[food.id]||latest.amount}</span>}
  </button>)}
 </div>;
}
