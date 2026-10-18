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
 return {pizzaWeights:weights,pizzaReturns:returns};
}
export function pizzaResult(game,draw){const {pizzaWeights}=pizzaSettings(game);let n=draw;for(let i=0;i<8;i++){n-=pizzaWeights[i];if(n<0)return pizzaFoods[i].id;}throw new Error("Invalid Pizza draw.");}
