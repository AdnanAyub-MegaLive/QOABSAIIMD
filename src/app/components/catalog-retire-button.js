"use client";
import {useState} from 'react';
export default function CatalogRetireButton({endpoint,id,label='Archive',onDone}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  async function retire() {
    const reason=window.prompt(`${label} this entry? Records are preserved. Enter a reason (1–500 characters).`);
    if (reason===null) return;
    if (!reason.trim() || reason.trim().length>500) {setError('Enter a reason of 1–500 characters.');return;}
    setBusy(true);setError('');
    try {
      const response=await fetch(endpoint,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,reason})});
      const result=await response.json();
      if (!response.ok) throw new Error(result.error?.message||'Unable to remove entry.');
      onDone?.();
    } catch(e) {setError(e.message);} finally {setBusy(false);}
  }
  return <span className="inline-flex flex-col gap-1"><button type="button" disabled={busy} onClick={retire} className="text-sm font-semibold text-rose-700 disabled:opacity-50">{busy?'Saving…':label}</button>{error&&<span role="alert" className="text-xs text-rose-700">{error}</span>}</span>;
}
