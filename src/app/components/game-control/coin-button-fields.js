"use client";
import { coinButtons } from "@/lib/game-control/coin-buttons.mjs";
export default function CoinButtonFields({game,onChange}) {
 const values=game.coinButtons??coinButtons(game);
 return <fieldset><legend>Coin buttons</legend><p>Set 1–4 unique amounts within the betting limits. Display order follows this list.</p><div className="form-grid">{values.map((value,index)=><label key={index}>Button {index+1}<input type="number" required min={game.minBet} max={game.maxBet} step={1} value={value} onChange={e=>onChange({coinButtons:values.map((n,i)=>i===index?(e.target.value===""?"":Number(e.target.value)):n)})}/><button type="button" disabled={values.length===1} onClick={()=>onChange({coinButtons:values.filter((_,i)=>i!==index)})}>Remove</button></label>)}</div><button type="button" disabled={values.length>=4} onClick={()=>onChange({coinButtons:[...values,""]})}>Add coin button</button></fieldset>;
}
