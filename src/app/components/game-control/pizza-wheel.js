"use client";
import {useEffect,useRef,useState} from "react";
import {greedySpinStep,greedyLandingStep} from "@/lib/game-control/greedy-motion.mjs";
import {pizzaFoods,pizzaSettings} from '@/lib/game-control/pizza.mjs';
import PizzaFood from './pizza-food';
import styles from './pizza.module.css';
const positions=[[23,23],[50,12],[77,23],[88,50],[77,77],[50,88],[23,77],[12,50]];
export default function PizzaWheel({game={},choice,onChoose,disabled,result,playing,elapsed=0,countdown,roundNumber,myTotals={},totals={},latest,winners,bonus,roundKey,duration=10000,onSettled}){
 const returns=pizzaSettings(game).pizzaReturns;
 const hot=pizzaFoods.reduce((best,food)=>BigInt(totals[food.id]||0)>BigInt(totals[best]||0)?food.id:best,null);
 const step=useRef(0),[landing,setLanding]=useState(null),[settled,setSettled]=useState(false);
 const target=pizzaFoods.findIndex(f=>f.id===(winners?.[0]||result));
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
 return <div className={`${styles.wheel} ${bonus&&settled?styles.bonusWheel:""}`} aria-label="Pizza food wheel">
  <div className={styles.hub}><img src="/games/pizza/slice.webp" alt=""/><small>Round {roundNumber}</small><small>{result?"Results":playing?"Playing":"Select Time"}</small><strong aria-live="polite">{result&&settled?<span className={styles.hubResults}>{(winners||[result]).map(id=><PizzaFood key={id} food={id}/>)}</span>:result?'…':countdown===undefined?'PIZZA':`${countdown}s`}</strong></div>
  {bonus&&settled&&<div key={roundKey} className={styles.feeding} aria-label={`${bonus} bonus — ${winners?.length||0} winning foods`}><img src={`/games/pizza/${bonus}.webp`} alt=""/><b>{bonus.toUpperCase()} BONUS!</b></div>}
  {pizzaFoods.map((food,i)=><button type="button" key={food.id} aria-label={`${food.name}, ${returns[i]} times, ${myTotals?.[food.id]||0} coins bet`} aria-pressed={choice===food.id} disabled={disabled||!onChoose} onClick={()=>onChoose?.(food.id)} data-winner={settled&&(winners||[result]).includes(food.id)} className={`${styles.food} ${(settled?(winners||[result]).includes(food.id):lit===i)?styles.lit:''}`} style={{left:`${positions[i][0]}%`,top:`${positions[i][1]}%`}}>
   <img className={styles.art} src={`/games/pizza/${food.id}.webp`} alt=""/>
   {settled&&(winners||[result]).includes(food.id)&&<span className={styles.winnerLabel}>WIN</span>}<b>{returns[i]}×</b>{hot===food.id&&<span className={styles.hot}>HOT</span>}<em>{BigInt(myTotals?.[food.id]||0).toLocaleString()}</em>
   {(latest?.input.choice===food.id||latest?.input.bets?.[food.id])&&<span key={latest.id} className={styles.chip}>+{latest.input.bets?.[food.id]||latest.amount}</span>}
  </button>)}
 </div>;
}
