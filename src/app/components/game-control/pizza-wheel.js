"use client";
import {pizzaFoods,pizzaSettings} from "@/lib/game-control/pizza.mjs";
import styles from "./pizza-utilities";
import Image from "next/image";
import pepperImage from "../../../../public/games/pizza/pepper.svg";
export default function PizzaWheel({game={},choice,onChoose,disabled,result,playing,elapsed=0,countdown}){
 const returns=pizzaSettings(game).pizzaReturns;
 const lit=result?pizzaFoods.findIndex(f=>f.id===result):playing?Math.floor(elapsed/120)%8:-1;
 return <div className={styles.wheel} aria-label="Pizza food wheel"><div className={styles.hub}><span>🍕</span><b>{result?pizzaFoods.find(f=>f.id===result)?.name:"PIZZA"}</b><small>{countdown!==undefined?`${countdown}s`:playing?"Choosing…":"Pick a food"}</small></div>{pizzaFoods.map((f,i)=>{return <button key={f.id} type="button" aria-label={`${f.name}, ${returns[i]} times`} aria-pressed={choice===f.id} disabled={disabled||!onChoose} onClick={()=>onChoose?.(f.id)} className={`${styles.food} ${lit===i?styles.lit:""} ${["left-[23.12994%] top-[23.12994%]","left-[50.00000%] top-[12.00000%]","left-[76.87006%] top-[23.12994%]","left-[88.00000%] top-[50.00000%]","left-[76.87006%] top-[76.87006%]","left-[50.00000%] top-[88.00000%]","left-[23.12994%] top-[76.87006%]","left-[12.00000%] top-[50.00000%]"][i]}`}><span>{f.id==="pepper"?<Image src={pepperImage} alt="" width={64} height={64} unoptimized className={styles.foodIcon}/>:f.icon}</span><small>{returns[i]}×</small></button>;})}</div>;
}
