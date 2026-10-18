// Versioned pool IDs keep per-account history stable when more questions are added.
import { triviaTier, shuffled } from "./trivia-plan.mjs";
export { triviaTier } from "./trivia-plan.mjs";
const facts = {
 easy: [["Which planet is called the Red Planet?","Mars","Venus","Jupiter","Saturn"],["How many sides has a hexagon?","6","5","7","8"],["Largest ocean?","Pacific","Atlantic","Indian","Arctic"],["Smallest prime number?","2","1","0","4"],["Plants absorb which gas for photosynthesis?","Carbon dioxide","Helium","Hydrogen","Nitrogen"],["How many minutes in two hours?","120","60","90","180"]],
 medium: [["Chemical symbol for gold?","Au","Ag","Fe","Pb"],["SI unit of force?","Newton","Watt","Joule","Pascal"],["Which organ produces insulin?","Pancreas","Liver","Kidney","Lung"],["Binary 1010 equals what in decimal?","10","8","12","14"],["Which layer lies between Earth's crust and core?","Mantle","Stratosphere","Troposphere","Ionosphere"],["A triangle's interior angles sum to?","180°","90°","270°","360°"]],
 hard: [["Atomic number of carbon?","6","8","12","14"],["Derivative of x³?","3x²","x²","3x","x⁴/4"],["Which has no electric charge?","Neutron","Proton","Electron","Positron"],["Which protocol translates domain names to IP addresses?","DNS","SMTP","SSH","FTP"],["What is log₂(128)?","7","6","8","9"],["Which organelle makes most ATP in human cells?","Mitochondrion","Nucleus","Ribosome","Golgi apparatus"]],
 expert: [["Determinant of [[2,3],[4,5]]?","−2","2","10","22"],["How many edges does a complete graph on six vertices have?","15","12","18","30"],["Derivative of ln(x), for x > 0?","1/x","x","ln(x)/x","eˣ"],["Which SQL isolation level prevents serialization anomalies?","Serializable","Read committed","Read uncommitted","Snapshot always"],["Probability of two heads in two fair independent coin flips?","1/4","1/2","3/4","1/8"],["How many distinct arrangements of the letters in LEVEL?","30","60","120","20"]],
};
export const triviaPools = Object.fromEntries(Object.entries(facts).map(([tier, rows]) => [tier, [
 ...rows.map((row,i) => ({id:`${tier}-fact-${i}`,text:row[0],correct:row[1],wrong:row.slice(2)})),
 ...Array.from({length:24},(_,i)=>{
   const n=i+3;
   const value=tier==="easy"?n+17:tier==="medium"?n*12:tier==="hard"?n*n:n*(n-1)/2;
   const text=tier==="easy"?`What is ${n} + 17?`:tier==="medium"?`What is ${n} × 12?`:tier==="hard"?`What is ${n}²?`:`How many ways can two objects be chosen from ${n} distinct objects?`;
   return {id:`${tier}-math-${i}`,text,correct:String(value),wrong:[String(value+1),String(value+3),String(value-1)]};
 }),
]]));
export function selectTrivia(amount, custom, history, random) {
 const {tier,count}=triviaTier(amount,custom),pool=triviaPools[tier];
 let seen=new Set(history[tier]||[]);const selected=[];
 for(let i=0;i<count;i++){
   let available=pool.filter(q=>!seen.has(q.id)&&!selected.some(s=>s.id===q.id));
   if(!available.length){seen=new Set();available=pool.filter(q=>!selected.some(s=>s.id===q.id));}
   const q=available[random(available.length)];seen.add(q.id);
   const options=shuffled([q.correct,...q.wrong],random);
   selected.push({id:q.id,text:q.text,options,answer:String(options.indexOf(q.correct))});
 }
 return {tier,questions:selected,history:{...history,[tier]:[...seen]}};
}
