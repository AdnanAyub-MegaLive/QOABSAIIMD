export function triviaTier(amount, custom = false) {
 if(!Number.isSafeInteger(amount)||amount<1)throw new Error("Invalid free-point amount.");
 return custom ? {tier:"expert",count:5} : amount>=10&&amount<=100 ? {tier:"easy",count:1} : amount===500 ? {tier:"medium",count:2} : amount===1000 ? {tier:"hard",count:3} : {tier:"expert",count:5};
}
export function shuffled(values, random) { const out=[...values];for(let i=out.length-1;i>0;i--){const j=random(i+1);[out[i],out[j]]=[out[j],out[i]];}return out; }
// Browser-only preview questions; the real question bank is never imported by the player.
export function selectPreviewTrivia(amount, custom, history, random) {
 const {tier,count}=triviaTier(amount,custom),start=history[tier]||0;
 const questions=Array.from({length:count},(_,i)=>{
   const n=(start+i)%100+2,answer=tier==="easy"?n+9:tier==="medium"?n*7:tier==="hard"?n*n:n*(n-1)/2;
   const text=tier==="easy"?`Preview: ${n} + 9?`:tier==="medium"?`Preview: ${n} × 7?`:tier==="hard"?`Preview: ${n}²?`:`Preview: choose 2 from ${n} objects?`;
   const options=shuffled([answer,answer+1,answer+3,answer-1].map(String),random);
   return {id:`preview-${tier}-${n}`,text,options,answer:String(options.indexOf(String(answer)))};
 });
 return {tier,questions,history:{...history,[tier]:(start+count)%100}};
}
