export const pizzaFoods=[
 {id:"tomato",icon:"🍅",name:"Tomato",returns:5},
 {id:"soup",icon:"🍲",name:"Soup",returns:10},
 {id:"mushroom",icon:"🍄",name:"Mushroom",returns:15},
 {id:"chicken",icon:"🍗",name:"Chicken",returns:25},
 {id:"steak",icon:"🥩",name:"Steak",returns:45},
 {id:"carrot",icon:"🥕",name:"Carrot",returns:5},
 {id:"corn",icon:"🌽",name:"Corn",returns:5},
 {id:"pepper",icon:"🫑",name:"Pepper",returns:5},
];
export function pizzaSettings(input={}){
 const weights=input.pizzaWeights??Array(8).fill(1),returns=input.pizzaReturns??pizzaFoods.map(f=>f.returns);
 if(!Array.isArray(weights)||weights.length!==8||weights.some(n=>!Number.isInteger(n)||n<0||n>10000)||!weights.some(n=>n>0))throw new Error("Pizza needs eight weights (0–10000), with at least one positive weight.");
 if(!Array.isArray(returns)||returns.length!==8||returns.some(n=>!Number.isFinite(n)||n<1||n>100||Math.abs(n*100-Math.round(n*100))>1e-7))throw new Error("Pizza returns must be eight multipliers from 1 to 100.");
 const pizzaBonusThreshold=input.pizzaBonusThreshold??0;
 if(!Number.isSafeInteger(pizzaBonusThreshold)||pizzaBonusThreshold<0||pizzaBonusThreshold>1000000000000)throw new Error('Bonus threshold must be 0–1,000,000,000,000 whole coins.');
 return {pizzaWeights:weights,pizzaReturns:returns,pizzaBonusThreshold};
}
export function pizzaResult(game,draw){const {pizzaWeights}=pizzaSettings(game);let n=draw;for(let i=0;i<8;i++){n-=pizzaWeights[i];if(n<0)return pizzaFoods[i].id;}throw new Error("Invalid Pizza draw.");}

// A single atomic entry represents six distinct Auto Play spots.
export function pizzaAutoBets(amount, random){
 if(!Number.isSafeInteger(amount)||amount<1||!Number.isSafeInteger(amount*6))throw new Error('Choose a valid whole coin amount.');
 const foods=pizzaFoods.map(f=>f.id);
 for(let i=foods.length-1;i>0;i--){const j=random(i+1);[foods[i],foods[j]]=[foods[j],foods[i]];}
 return Object.fromEntries(foods.slice(0,6).map(id=>[id,amount]));
}
export function pizzaPayout(game,bets,winners){
 const returns=pizzaSettings(game).pizzaReturns;
 return Object.entries(bets).reduce((sum,[id,amount])=>{
  const i=pizzaFoods.findIndex(f=>f.id===id);
  if(i<0)throw new Error('Unknown Pizza food.');
  return sum+(winners.includes(id)?BigInt(amount)*BigInt(Math.round(returns[i]*100))/100n:0n);
 },0n);
}

export const pizzaGroups={salad:['tomato','pepper','corn','carrot'],pizza:['soup','mushroom','chicken','steak']};
export function pizzaBonus(random){
 const bonus=random(2)===0?'salad':'pizza',foods=[...pizzaGroups[bonus]],count=2+random(2);
 for(let i=foods.length-1;i>0;i--){const j=random(i+1);[foods[i],foods[j]]=[foods[j],foods[i]];}
 const winners=foods.slice(0,count);
 return {result:winners[0],winners,bonus};
}
export function pizzaBonusReady(pool,game){
 const threshold=BigInt(pizzaSettings(game).pizzaBonusThreshold);
 return threshold>0n&&BigInt(pool.balance)>=threshold&&BigInt(pool.progress)>=threshold;
}
