"use client";
import useFoodWheelMotion from "./use-food-wheel-motion";
import {pizzaFoods,pizzaSettings} from '@/lib/game-control/pizza.mjs';
import PizzaFood from './pizza-food';
import styles from './pizza.module.css';
const positions=[[23,23],[50,12],[77,23],[88,50],[77,77],[50,88],[23,77],[12,50]];
export default function PizzaWheel({game={},choice,onChoose,disabled,result,playing,elapsed=0,countdown,roundNumber,myTotals={},totals={},latest,winners,bonus,roundKey,duration=10000,onSettled}){
 const returns=pizzaSettings(game).pizzaReturns;
 const hot=pizzaFoods.reduce((best,food)=>BigInt(totals[food.id]||0)>BigInt(totals[best]||0)?food.id:best,null);
 const target=pizzaFoods.findIndex(f=>f.id===(winners?.[0]||result));
 const {lit,settled}=useFoodWheelMotion({playing,elapsed,duration,target,roundKey,bonus,onSettled});
 return <div className={`${styles.wheel} ${bonus&&settled?styles.bonusWheel:""}`} aria-label="Pizza food wheel">
  <div className={styles.hub}><img src="/games/pizza/slice.webp" alt=""/><small>Round {roundNumber}</small><small>{result?"Results":playing?"Playing":"Select Time"}</small><strong aria-live="polite">{result&&settled?<span className={styles.hubResults}>{(winners||[result]).map(id=><PizzaFood key={id} food={id}/>)}</span>:result?'…':countdown===undefined?'PIZZA':`${countdown}s`}</strong></div>
  {bonus&&settled&&<div key={roundKey} className={styles.feeding} aria-label={`${bonus} bonus — ${winners?.length||0} winning foods`}><img src={`/games/pizza/${bonus}.webp`} alt=""/><b>{bonus.toUpperCase()} BONUS!</b></div>}
  {pizzaFoods.map((food,i)=><button type="button" key={food.id} aria-label={`${food.name}, ${returns[i]} times, ${myTotals?.[food.id]||0} coins bet`} aria-pressed={choice===food.id} disabled={disabled||!onChoose||(Object.values(myTotals).filter(n=>BigInt(n)>0n).length>=6&&!BigInt(myTotals[food.id]||0))} onClick={()=>onChoose?.(food.id)} data-winner={settled&&(winners||[result]).includes(food.id)} className={`${styles.food} ${(settled?(winners||[result]).includes(food.id):lit===i)?styles.lit:''}`} style={{left:`${positions[i][0]}%`,top:`${positions[i][1]}%`}}>
   <img className={styles.art} src={`/games/pizza/${food.id}.webp`} alt=""/>
   {settled&&(winners||[result]).includes(food.id)&&<span className={styles.winnerLabel}>WIN</span>}<b>{returns[i]}×</b>{hot===food.id&&<span className={styles.hot}>HOT</span>}<em>{BigInt(myTotals?.[food.id]||0).toLocaleString()}</em>
   {(latest?.input.choice===food.id||latest?.input.bets?.[food.id])&&<span key={latest.id} className={styles.chip}>+{latest.input.bets?.[food.id]||latest.amount}</span>}
  </button>)}
 </div>;
}
