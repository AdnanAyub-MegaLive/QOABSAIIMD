import { shuffled } from "./trivia-plan.mjs";
export function rankHand(cards) {
 const ranks=cards.map(c=>c%13+2).sort((a,b)=>b-a),flush=cards.every(c=>Math.floor(c/13)===Math.floor(cards[0]/13));
 const counts=ranks.map(r=>ranks.filter(n=>n===r).length);
 // Variant: AKQ highest sequence, A23 second, then KQJ through 432.
 const straight=ranks.join() === "14,3,2"?13.5:ranks[0]-ranks[1]===1&&ranks[1]-ranks[2]===1?ranks[0]:0;
 if(counts[0]===3)return [6,ranks[0]];
 if(flush&&straight)return [5,straight];
 if(straight)return [4,straight];
 if(flush)return [3,...ranks];
 if(counts.includes(2))return [2,ranks[counts.indexOf(2)],ranks[counts.indexOf(1)]];
 return [1,...ranks];
}
export function dealTeenPatti(random) {
 const deck=shuffled(Array.from({length:52},(_,i)=>i),random);
 const player=deck.slice(0,3),computer=deck.slice(3,6),a=rankHand(player),b=rankHand(computer);
 let compare=0;for(let i=0;i<Math.max(a.length,b.length);i++){if(a[i]!==b[i]){compare=a[i]>b[i]?1:-1;break;}}
 const labels=["","High card","Pair","Colour","Sequence","Pure sequence","Trail"];
 const display=cards=>cards.map(c=>`${({11:"J",12:"Q",13:"K",14:"A"})[c%13+2]||c%13+2}${["♠","♥","♦","♣"][Math.floor(c/13)]}`);
 return {compare,playerCards:display(player),computerCards:display(computer),playerHand:labels[a[0]],computerHand:labels[b[0]]};
}
