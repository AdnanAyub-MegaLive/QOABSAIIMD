'use client';
import {useState} from 'react';
export default function HostSalarySettings({initial,revision,enabled,canManage}) {
 const [tiers,setTiers]=useState(initial),[notice,setNotice]=useState(enabled),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 async function save(){
   setBusy(true);
   try {
     const response=await fetch('/api/admin/host-salary',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tiers,revision,noticeEnabled:notice})});
     if(!response.ok)throw new Error((await response.json()).error);
     location.reload();
   }catch(e){setMessage(e.message);}finally{setBusy(false);}
 }
 return <section className="rounded-xl bg-white p-5"><h3 className="font-bold">Host salary schedule</h3><p>90,000 diamonds = $1. Tier changes apply from the next host salary cycle.</p>
 <fieldset disabled={!canManage||busy}><label><input type="checkbox" checked={notice} onChange={e=>setNotice(e.target.checked)}/> Show Host Journey notice</label>
 <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{['Level','Target diamonds','USD','Agency %','Agency USD','Reward diamonds','VIP','Days'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{tiers.map((t,i)=>{
 const input=key=><input aria-label={`Level ${t.level} ${key}`} className="w-24 rounded border p-1" type="number" min="0" value={t[key]} onChange={e=>setTiers(tiers.map((row,n)=>n===i?{...row,[key]:Number(e.target.value)}:row))}/>;
 return <tr key={t.level}><td>{t.level}</td><td>{input('target')}</td><td>{(t.target/90000).toFixed(2)}</td><td>{input('percent')}</td><td>{(t.target*t.percent/9000000).toFixed(2)}</td><td>{input('reward')}</td><td>{input('vip')}</td><td>{input('days')}</td></tr>;
 })}</tbody></table></div>{canManage&&<button onClick={save}>Save salary schedule</button>}</fieldset><p role="status">{message}</p></section>;
}
