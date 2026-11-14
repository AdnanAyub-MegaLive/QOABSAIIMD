'use client';
import {useState} from 'react';
export default function AgencyReference({agencyId,initial,canManage}) {
  const [reference,setReference]=useState(initial),[code,setCode]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  async function save(e){e.preventDefault();setBusy(true);setMessage('');try{
    const response=await fetch(`/api/admin/agencies/${encodeURIComponent(agencyId)}/reference`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({bdCode:code.trim()})});
    const body=await response.json();if(!response.ok||!body.success)throw new Error(body.error?.message || 'Unable to update agency reference.');
    setReference(body.data.bdReference);setMessage('Agency reference updated.');setCode('');
  }catch(error){setMessage(error.message);}finally{setBusy(false);}}
  return <section className="rounded-xl bg-white p-5"><h2 className="font-bold">Assigned BD / team reference</h2><p className="mt-2 text-sm">{reference ? `${reference.name} · ${reference.publicId ?? reference.id}` : 'Not assigned'}</p>{canManage&&<form onSubmit={save} className="mt-4 flex flex-wrap gap-3"><label className="text-sm">New BD code<input required value={code} onChange={e=>setCode(e.target.value)} className="ml-2 rounded border p-2"/></label><button disabled={busy||!code.trim()} className="rounded bg-teal-700 px-4 py-2 text-white disabled:opacity-50">{busy?'Saving…':'Update reference'}</button></form>}{message&&<p role="status" className="mt-3 text-sm">{message}</p>}</section>;
}
