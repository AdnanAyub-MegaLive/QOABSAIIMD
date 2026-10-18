"use client";
import {useState} from "react";
import {pizzaFoods,pizzaSettings} from "@/lib/game-control/pizza.mjs";
export default function PizzaEditor({game,onClose,onSave}){
 const [form,setForm]=useState({...game,...pizzaSettings(game)});
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 async function submit(e){e.preventDefault();setBusy(true);try{await onSave(form);}catch(err){setError(err.message);}finally{setBusy(false);}}
 return <form onSubmit={submit}><div className="modal-body">
 <p>Free points only. Shared room rounds. Settings apply next UTC day; pausing applies immediately. Weight divided by total weight determines each food’s probability.</p>
 <div className="form-grid"><label>Name<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label>Availability<select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><option value="paused">Paused</option><option value="active">Active</option></select></label>
 {["minBet","maxBet"].map(k=><label key={k}>{k==="minBet"?"Minimum points":"Maximum points"}<input type="number" min={1} max={1000000} required value={form[k]} onChange={e=>setForm({...form,[k]:Number(e.target.value)})}/></label>)}
 </div>
 {pizzaFoods.map((f,i)=><fieldset key={f.id}><legend>{f.icon} {f.name}</legend>{["pizzaWeights","pizzaReturns"].map(k=><label key={k}>{k==="pizzaWeights"?"Selection weight":"Point return multiplier"}<input type="number" min={k==="pizzaWeights"?0:1} max={k==="pizzaWeights"?10000:100} step={k==="pizzaWeights"?1:.01} required value={form[k][i]} onChange={e=>setForm({...form,[k]:form[k].map((n,j)=>j===i?Number(e.target.value):n)})}/></label>)}</fieldset>)}
 {error&&<p role="alert">{error}</p>}<button type="button" onClick={onClose}>Close</button><button disabled={busy}>Save Pizza</button></div></form>;
}
