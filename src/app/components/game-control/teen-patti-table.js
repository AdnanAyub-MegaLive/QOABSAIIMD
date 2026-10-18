import styles from "./teen-patti-table.module.css";
export default function TeenPattiTable({phase,remaining,outcome,totals,myTotals,mine,onPlace,disabled,roundNumber}){
 return <div className={styles.table} data-phase={phase}>
  <div className={styles.clock}><small>ROUND {roundNumber}</small><b>{phase==="open"?"PLACE YOUR POINTS":phase==="playing"?"ENTRIES CLOSED":outcome?"RESULT":"NEXT ROUND"}</b><strong>{remaining}s</strong></div>
  <div className={styles.hands}>{["1","2","3"].map((id,i)=>{
   const hand=outcome?.hands?.[i],won=outcome?.winners?.includes(id),own=mine?.input.choice===id;
   return <button key={id} disabled={disabled} onClick={()=>onPlace(id)} className={styles.hand} data-won={won||false} aria-label={`Place points on hand ${id}`}>
    <span className={styles.crest}>{["🏆","👑","💎"][i]}</span><b>HAND {id}</b>
    <div className={styles.cards}>{(hand?.cards||["?","?","?"]).map((card,j)=><span key={`${roundNumber}-${card}-${j}`} data-red={/[♥♦]/.test(card)} data-back={!hand} style={{animationDelay:`${j*100+i*200}ms`}}>{hand?card:"♠"}</span>)}</div>
    <div className={styles.ribbon}>{hand?`${won?"★ ":""}${hand.label}`:phase==="open"?"TAP TO PLACE":"WAIT FOR REVEAL"}</div>
    <small>Table: {totals?.[id]||0}</small><div className={styles.chips}>{Number(totals?.[id]||0)>0&&[0,1,2,3,4].map(n=><i key={`${totals[id]}-${n}`} style={{animationDelay:`${n*55}ms`}}>●</i>)}</div><small>Mine: {myTotals?.[id]||(own?mine.amount:0)}</small>
   </button>;
  })}</div>
 </div>;
}
