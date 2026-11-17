export const greedyFoods=[
 {id:"chicken",icon:"🍗",name:"Roast chicken",returns:45},
 {id:"octopus",icon:"🐙",name:"Octopus",returns:25},
 {id:"fish",icon:"🐟",name:"Fish",returns:15},
 {id:"meat",icon:"🥩",name:"Meat",returns:10},
 {id:"grapes",icon:"🍇",name:"Grapes",returns:5},
 {id:"lettuce",icon:"🥬",name:"Lettuce",returns:5},
 {id:"corn",icon:"🌽",name:"Corn",returns:5},
 {id:"strawberry",icon:"🍓",name:"Strawberry",returns:5},
];
export function greedySettings(input={}){
 const weights=input.greedyWeights??Array(8).fill(1),returns=input.greedyReturns??greedyFoods.map(f=>f.returns);
 if(!Array.isArray(weights)||weights.length!==8||weights.some(n=>!Number.isInteger(n)||n<0||n>10000)||!weights.some(n=>n>0))throw new Error("Greedy needs eight weights (0–10000), with at least one positive weight.");
 if(!Array.isArray(returns)||returns.length!==8||returns.some(n=>!Number.isFinite(n)||n<1||n>100||Math.abs(n*100-Math.round(n*100))>1e-7))throw new Error("Greedy returns must be eight multipliers from 1 to 100.");
 const greedyBonusThreshold=input.greedyBonusThreshold??0;
 if(!Number.isSafeInteger(greedyBonusThreshold)||greedyBonusThreshold<0||greedyBonusThreshold>1000000000000)throw new Error('Bonus threshold must be 0–1,000,000,000,000 whole coins. Zero disables bonuses.');
 return {greedyWeights:weights,greedyReturns:returns,greedyBonusThreshold};
}
export function greedyResult(game,draw){const {greedyWeights}=greedySettings(game);let n=draw;for(let i=0;i<8;i++){n-=greedyWeights[i];if(n<0)return greedyFoods[i].id;}throw new Error("Invalid Greedy draw.");}

// A single atomic entry represents six distinct Auto Play spots.
export function greedyAutoBets(amount, random){
 if(!Number.isSafeInteger(amount)||amount<1||!Number.isSafeInteger(amount*6))throw new Error('Choose a valid whole coin amount.');
 const foods=greedyFoods.map(f=>f.id);
 for(let i=foods.length-1;i>0;i--){const j=random(i+1);[foods[i],foods[j]]=[foods[j],foods[i]];}
 return Object.fromEntries(foods.slice(0,6).map(id=>[id,amount]));
}
export function greedyPayout(game,bets,winners){
 const returns=greedySettings(game).greedyReturns;
 return Object.entries(bets).reduce((sum,[id,amount])=>{
  const i=greedyFoods.findIndex(f=>f.id===id);
  if(i<0)throw new Error('Unknown Greedy food.');
  return sum+(winners.includes(id)?BigInt(amount)*BigInt(Math.round(returns[i]*100))/100n:0n);
 },0n);
}

export const greedyGroups={salad:['strawberry','corn','lettuce','grapes'],pizza:['chicken','octopus','fish','meat']};
export function greedyBonus(random){
 const bonus=random(2)===0?'salad':'pizza',foods=[...greedyGroups[bonus]],count=2+random(2);
 for(let i=foods.length-1;i>0;i--){const j=random(i+1);[foods[i],foods[j]]=[foods[j],foods[i]];}
 const winners=foods.slice(0,count);
 return {result:winners[0],winners,bonus};
}
export function greedyBonusReady(pool,game){
 const threshold=BigInt(greedySettings(game).greedyBonusThreshold);
 return threshold>0n&&BigInt(pool.balance)>=threshold&&BigInt(pool.progress)>=threshold;
}
