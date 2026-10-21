"use client";
import {useRef,useState} from "react";
import {fundReseller} from "./actions";
export default function Form({userId,business,personal}){
  const [balance,setBalance]=useState(business),[message,setMessage]=useState(""),[pending,setPending]=useState(false);
  const key=useRef(null);
  return <form className="space-y-3" onSubmit={async e=>{e.preventDefault();const form=new FormData(e.currentTarget);key.current??=crypto.randomUUID();setPending(true);try{const result=await fundReseller(userId,form.get("coins"),key.current,form.get("reason"));setBalance(result.businessCoins);setMessage(`Business wallet funded. Reference: ${result.referenceId}`);key.current=null;}catch(error){setMessage(error.message);}finally{setPending(false);}}}><p>Business Coins: {balance}</p><p>Personal Coins (unchanged): {personal}</p><label className="block">Add business Coins<input className="block border p-2" name="coins" type="number" min="1" max="500000000" required disabled={pending}/></label><label className="block">Reason<input className="block border p-2" name="reason" maxLength={500} required disabled={pending}/></label><button className="rounded border p-2" disabled={pending}>Fund business wallet</button><p role="status">{message}</p></form>;
}
