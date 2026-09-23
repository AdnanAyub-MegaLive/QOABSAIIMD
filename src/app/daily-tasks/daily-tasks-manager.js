"use client";

import { useState } from "react";

const input = "mt-1.5 h-11 w-full rounded-lg border border-[#cededb] bg-white px-3 text-sm outline-none focus:border-[#16877d]";
const blankTask = { type:"", title:"", description:"", rewardCoins:"500", targetValue:1, unit:"COUNT", cadence:"DAILY", categoryKey:"Daily", icon:"checkin", iconUrl:"", featured:false, topSupporter:false, sortOrder:100, active:true };

export default function DailyTasksManager({ initialCategories, initialTasks }) {
  const [categories,setCategories]=useState(initialCategories);
  const [tasks,setTasks]=useState(initialTasks);
  const [taskDraft,setTaskDraft]=useState(null);
  const [categoryDraft,setCategoryDraft]=useState(null);
  const [saving,setSaving]=useState(false);
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");
  async function save(body,method){
    setSaving(true);setError("");setNotice("");
    try{
      const response=await fetch("/api/admin/daily-tasks",{method,headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error?.message||"Unable to save configuration.");
      if(body.entity==="category"){
        const item=result.data.category;
        setCategories((current)=>method==="POST"?[...current,{...item,taskCount:0}].sort(order):current.map((value)=>value.key===item.key?{...value,...item}:value).sort(order));
        setCategoryDraft(null);
      }else{
        const item=result.data.task;
        setTasks((current)=>{
          const normalized=current.map((value)=>({
            ...value,
            ...(item.featured?{featured:false}:{}),
            ...(item.topSupporter?{topSupporter:false}:{}),
          }));
          return method==="POST"?[...normalized,{...item,instanceCount:0}].sort(order):normalized.map((value)=>value.id===item.id?{...value,...item}:value).sort(order);
        });
        if(method==="POST")setCategories((current)=>current.map((value)=>value.key===item.categoryKey?{...value,taskCount:value.taskCount+1}:value));
        setTaskDraft(null);
      }
      setNotice("Daily-task configuration saved.");
    }catch(exception){setError(exception.message);}finally{setSaving(false);}
  }
  const activeTasks=tasks.filter((item)=>item.active).length;
  const dailyRewards=tasks.filter((item)=>item.active&&item.cadence==="DAILY").reduce((sum,item)=>sum+Number(item.rewardCoins),0);
  return <div className="space-y-6">
    <div className="grid gap-3 sm:grid-cols-3"><Metric label="Configured tasks" value={tasks.length}/><Metric label="Active tasks" value={activeTasks}/><Metric label="Available daily rewards" value={`${dailyRewards.toLocaleString()} coins`}/></div>
    {(notice||error)&&<p className={`rounded-xl px-4 py-3 text-xs font-semibold ${error?"bg-rose-50 text-rose-700":"bg-emerald-50 text-emerald-700"}`}>{error||notice}</p>}
    <section className="rounded-2xl border border-[#dce8e5] bg-white"><div className="flex items-center justify-between border-b p-5"><div><h3 className="font-bold">Mobile tabs</h3><p className="mt-1 text-[11px] text-[#71847f]">Categories remain visible even when they contain no missions.</p></div><button onClick={()=>setCategoryDraft({key:"",icon:"star",sortOrder:100,active:true,isNew:true})} className="rounded-lg bg-[#e7f5f2] px-4 py-2.5 text-xs font-bold text-[#087f74]">+ Add category</button></div><div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-5">{categories.map((item)=><button key={item.key} onClick={()=>setCategoryDraft({...item})} className={`rounded-xl border p-4 text-left transition hover:border-[#16877d] ${item.active?"border-[#dce8e5]":"border-dashed border-[#d9dfdd] opacity-60"}`}><p className="text-[10px] font-bold text-[#16877d] uppercase">{item.icon}</p><h4 className="mt-2 font-bold">{item.key}</h4><p className="mt-1 text-[10px] text-[#71847f]">{item.taskCount} task(s) · order {item.sortOrder}</p></button>)}</div></section>
    <section className="overflow-hidden rounded-2xl border border-[#dce8e5] bg-white"><div className="flex items-center justify-between border-b p-5"><div><h3 className="font-bold">Task definitions</h3><p className="mt-1 text-[11px] text-[#71847f]">Click a task to edit it. Built-in progress is available for SIGN_IN, ROOM_WATCH, SEND_GIFTS, LIVE_GO_LIVE and TOP_SUPPORTER; new custom types remain at zero until a backend progress source is connected.</p></div><button onClick={()=>setTaskDraft({...blankTask,categoryKey:categories.find(x=>x.active)?.key??""})} className="rounded-lg bg-[#087f74] px-4 py-2.5 text-xs font-bold text-white">+ Add task</button></div><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-xs"><thead className="bg-[#f7faf9] text-[#71847f]"><tr><th className="px-5 py-3">Task</th><th className="px-5 py-3">Category</th><th className="px-5 py-3">Target</th><th className="px-5 py-3">Reward</th><th className="px-5 py-3">Placement</th><th className="px-5 py-3">Status</th></tr></thead><tbody>{tasks.map((item)=><tr key={item.id} onClick={()=>setTaskDraft({...item})} className="cursor-pointer border-t hover:bg-[#f7fbfa]"><td className="px-5 py-4"><p className="font-bold">{item.title}</p><p className="mt-1 font-mono text-[9px] text-[#71847f]">{item.type}</p></td><td className="px-5 py-4">{item.categoryKey}</td><td className="px-5 py-4">{item.unit==="SECONDS"?`${item.targetValue/60} min`:item.targetValue}</td><td className="px-5 py-4 font-semibold">{Number(item.rewardCoins).toLocaleString()} coins</td><td className="px-5 py-4">{item.featured?"Featured":item.topSupporter?"Top supporter":"Category"}</td><td className="px-5 py-4"><Status active={item.active}/></td></tr>)}</tbody></table></div></section>
    {taskDraft&&<TaskModal draft={taskDraft} categories={categories} saving={saving} onClose={()=>setTaskDraft(null)} onSave={(draft)=>save(draft,draft.id?"PATCH":"POST")}/>} 
    {categoryDraft&&<CategoryModal draft={categoryDraft} saving={saving} onClose={()=>setCategoryDraft(null)} onSave={(draft)=>save({entity:"category",...draft},draft.isNew?"POST":"PATCH")}/>} 
  </div>;
}

function TaskModal({draft,categories,saving,onClose,onSave}){const [form,setForm]=useState(draft);const set=(key,value)=>setForm((current)=>({...current,[key]:value}));return <Modal title={draft.id?"Edit task":"Create task"} onClose={onClose}><form onSubmit={(event)=>{event.preventDefault();onSave(form);}} className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><Field label="Task type"><input className={input} value={form.type} onChange={(e)=>set("type",e.target.value.toUpperCase())} disabled={Boolean(draft.id)} required placeholder="ROOM_WATCH"/></Field><Field label="Category"><select className={input} value={form.categoryKey} onChange={(e)=>set("categoryKey",e.target.value)} required>{categories.map((x)=><option key={x.key}>{x.key}</option>)}</select></Field></div><Field label="Title"><input className={input} value={form.title} onChange={(e)=>set("title",e.target.value)} required maxLength={120}/></Field><Field label="Description"><textarea className={`${input} h-auto py-3`} rows={3} value={form.description??""} onChange={(e)=>set("description",e.target.value)} maxLength={500}/></Field><div className="grid gap-4 sm:grid-cols-3"><Field label="Reward coins"><input className={input} type="number" min="0" value={form.rewardCoins} onChange={(e)=>set("rewardCoins",e.target.value)} required/></Field><Field label="Target"><input className={input} type="number" min="1" value={form.targetValue} onChange={(e)=>set("targetValue",e.target.value)} required/></Field><Field label="Unit"><select className={input} value={form.unit} onChange={(e)=>set("unit",e.target.value)}><option value="COUNT">Count</option><option value="SECONDS">Time (seconds)</option></select></Field></div><div className="grid gap-4 sm:grid-cols-3"><Field label="Cadence"><select className={input} value={form.cadence} onChange={(e)=>set("cadence",e.target.value)}><option value="DAILY">Daily</option><option value="WEEKLY">Weekly</option></select></Field><Field label="Bundled icon key"><input className={input} value={form.icon??""} onChange={(e)=>set("icon",e.target.value)} placeholder="watch"/></Field><Field label="Sort order"><input className={input} type="number" min="0" value={form.sortOrder} onChange={(e)=>set("sortOrder",e.target.value)} required/></Field></div><Field label="Remote icon URL (optional HTTPS)"><input className={input} type="url" value={form.iconUrl??""} onChange={(e)=>set("iconUrl",e.target.value)} placeholder="https://..."/></Field><div className="grid gap-2 sm:grid-cols-3"><Check label="Active" checked={form.active} onChange={(v)=>set("active",v)}/><Check label="Featured card" checked={form.featured} onChange={(v)=>set("featured",v)}/><Check label="Top supporter card" checked={form.topSupporter} onChange={(v)=>set("topSupporter",v)}/></div><Actions saving={saving} onClose={onClose}/></form></Modal>}
function CategoryModal({draft,saving,onClose,onSave}){const [form,setForm]=useState(draft);return <Modal title={draft.isNew?"Create category":"Edit category"} onClose={onClose}><form onSubmit={(e)=>{e.preventDefault();onSave(form)}} className="space-y-4"><Field label="Tab name"><input className={input} value={form.key} disabled={!draft.isNew} onChange={(e)=>setForm({...form,key:e.target.value})} required maxLength={40}/></Field><Field label="Bundled icon key"><input className={input} value={form.icon} onChange={(e)=>setForm({...form,icon:e.target.value})} required maxLength={40}/></Field><Field label="Sort order"><input className={input} type="number" min="0" value={form.sortOrder} onChange={(e)=>setForm({...form,sortOrder:e.target.value})} required/></Field><Check label="Visible in the mobile app" checked={form.active} onChange={(active)=>setForm({...form,active})}/><Actions saving={saving} onClose={onClose}/></form></Modal>}
function Modal({title,onClose,children}){return <div className="fixed inset-0 z-50 overflow-y-auto bg-[#071f1d]/65 p-4"><div className="mx-auto my-5 max-w-2xl rounded-2xl bg-white shadow-2xl"><div className="flex items-center justify-between border-b px-6 py-5"><h3 className="text-lg font-bold">{title}</h3><button onClick={onClose} className="text-2xl text-[#71847f]" aria-label="Close">×</button></div><div className="p-6">{children}</div></div></div>}
function Field({label,children}){return <label className="block text-xs font-bold">{label}{children}</label>}
function Check({label,checked,onChange}){return <label className="flex items-center gap-3 rounded-lg border border-[#dce8e5] p-3 text-xs font-bold"><input type="checkbox" checked={Boolean(checked)} onChange={(e)=>onChange(e.target.checked)} className="h-4 w-4 accent-[#087f74]"/>{label}</label>}
function Actions({saving,onClose}){return <div className="flex justify-end gap-2 border-t pt-5"><button type="button" onClick={onClose} className="rounded-lg border px-4 py-2.5 text-xs font-bold">Cancel</button><button disabled={saving} className="rounded-lg bg-[#087f74] px-5 py-2.5 text-xs font-bold text-white disabled:opacity-50">{saving?"Saving…":"Save"}</button></div>}
function Metric({label,value}){return <div className="rounded-xl border border-[#dce8e5] bg-white p-4"><p className="text-[10px] font-bold text-[#71847f] uppercase">{label}</p><p className="mt-2 text-lg font-bold">{value}</p></div>}
function Status({active}){return <span className={`rounded-full px-2.5 py-1 text-[9px] font-bold ${active?"bg-emerald-50 text-emerald-700":"bg-slate-100 text-slate-600"}`}>{active?"Active":"Inactive"}</span>}
function order(a,b){return Number(a.sortOrder)-Number(b.sortOrder)||String(a.key??a.title).localeCompare(String(b.key??b.title))}
