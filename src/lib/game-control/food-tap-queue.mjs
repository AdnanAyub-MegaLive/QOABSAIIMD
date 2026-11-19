// One immutable id per tap. An uncertain response is retried with the same id,
// so a lost receipt can never cause a second charge.
export function createFoodTapQueue({send,onChange,onError,refresh,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}) {
 let entries=[],running=false,stopped=false;
 const emit=()=>onChange(entries.map(({payload})=>payload));
 async function drain(){
  if(running||stopped)return;running=true;
  try{
   while(!stopped){
    const entry=entries.find(e=>!e.accepted);if(!entry)break;
    try{await send(entry.payload);entry.accepted=true;
     if(!stopped&&!entries.some(e=>!e.accepted))await refresh().catch(()=>{});}
    catch(error){
     if(stopped)break;
     if(error.status&&error.status<500&&![408,429].includes(error.status)){
      entries=entries.filter(e=>e!==entry);emit();onError(error.message);continue;
     }
     onError('Reconnecting — your queued bets are being checked.');await wait(1500);
    }
   }
  }finally{running=false;}
 }
 return {
  add(payload){entries.push({payload,accepted:false});emit();void drain();},
  reconcile(ids,dayId,slot){const confirmed=new Set(ids);entries=entries.filter(e=>!confirmed.has(e.payload.id)&&!(e.accepted&&dayId!==undefined&&(e.payload.dayId!==dayId||e.payload.slot!==slot)));emit();},
  pending(){return entries.map(e=>e.payload);},
  stop(){stopped=true;},
 };
}
