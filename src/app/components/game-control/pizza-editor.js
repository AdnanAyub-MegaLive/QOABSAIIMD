"use client";
import CoinButtonFields from "./coin-button-fields";
import GameLevelFields from "./game-level-fields";
import RoundTimingFields from "./round-timing-fields";
import {useState} from "react";
import {pizzaFoods,pizzaSettings} from "@/lib/game-control/pizza.mjs";
export default function PizzaEditor({game,onClose,onSave}){
 const [form,setForm]=useState({...game,...pizzaSettings(game)});
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 async function submit(e){e.preventDefault();setBusy(true);try{await onSave(form);}catch(err){setError(err.message);}finally{setBusy(false);}}
 return <form onSubmit={submit}><div className="modal-body"><GameLevelFields game={form} onChange={patch=>setForm(previous=>({...previous,...patch}))}/><RoundTimingFields game={form} onChange={patch=>setForm(previous=>({...previous,...patch}))} />
 <p>Application coin wallet. Application-wide shared rounds. Settings apply from the next round; pausing applies immediately. Weight divided by total weight determines each food’s probability.</p>
 <div className="form-grid"><label>Name<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label>Availability<select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><option value="paused">Paused</option><option value="active">Active</option></select></label>
 {["minBet","maxBet"].map(k=><label key={k}>{k==="minBet"?"Minimum coins":"Maximum coins"}<input type="number" min={1} max={100000000} required value={form[k]} onChange={e=>setForm({...form,[k]:Number(e.target.value)})}/></label>)}
 </div>
 <CoinButtonFields game={form} onChange={patch=>setForm(previous=>({...previous,...patch}))}/>
 <label>Bonus pool threshold (coins)<input type="number" min={0} max={1000000000000} step={1} required value={form.pizzaBonusThreshold} onChange={e=>setForm({...form,pizzaBonusThreshold:Number(e.target.value)})}/></label>
 <p>Zero disables bonuses. Settled stakes minus payouts build the pool. A bonus requires both the retained pool and fresh net losses since the last trigger to reach this threshold. Full payouts are honored; deficits carry forward. Salad and Pizza choose 2–3 winning foods at their configured multipliers.</p>
 <p>Review selection weights before enabling live bets. Default equal weights are for preview, not recommended live odds.</p>
 {pizzaFoods.map((f,i)=><fieldset key={f.id}><legend>{f.icon} {f.name}</legend>{["pizzaWeights","pizzaReturns"].map(k=><label key={k}>{k==="pizzaWeights"?"Selection weight":"Gross return multiplier"}<input type="number" min={k==="pizzaWeights"?0:1} max={k==="pizzaWeights"?10000:100} step={k==="pizzaWeights"?1:.01} required value={form[k][i]} onChange={e=>setForm({...form,[k]:form[k].map((n,j)=>j===i?Number(e.target.value):n)})}/></label>)}</fieldset>)}
 {error&&<p role="alert">{error}</p>}<button type="button" onClick={onClose}>Close</button><button disabled={busy}>Save Pizza</button></div></form>;
}
