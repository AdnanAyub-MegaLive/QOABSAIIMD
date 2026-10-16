'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
export default function RankingTemplate({exists}){
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('');const router=useRouter();
  async function create(){setBusy(true);setMessage('');try{
    const csrf=decodeURIComponent(document.cookie.split('; ').find(p=>p.startsWith('streamline_events_csrf='))?.split('=')[1]||'');
    const response=await fetch('/api/events/rankings-template',{method:'POST',headers:{'x-events-csrf':csrf}});
    const body=await response.json();if(!response.ok)throw Error(body.error?.message||'Unable to create the event.');
    setMessage('Draft created. Publish it from the event list when ready.');router.refresh();
  }catch(error){setMessage(error.message);}finally{setBusy(false);}}
  return <section className="my-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-violet-200 bg-violet-50 p-5">
    <div><h3 className="font-bold text-violet-950">Mega Live Rankings</h3><p className="mt-1 text-sm text-violet-800">Mobile event · Wealth, Charm, Agency and CP · Live gift records</p><p className="mt-1 text-xs text-slate-600">Publishes at /event/rankings/index.html. Mobile session integration required. Family is out of scope.</p></div>
    <button disabled={busy||exists} onClick={create} className="rounded-xl bg-violet-800 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{exists?'Added to event list':busy?'Creating draft…':'Create ranking event'}</button>
    {message&&<p role="status" className="w-full text-sm">{message}</p>}
  </section>;
}
