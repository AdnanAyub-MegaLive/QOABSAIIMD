import {bets as markets,settleRound,resultColor} from './original-rules.mjs';
export {markets,resultColor};
export function validateWeights(weights){if(!Array.isArray(weights)||weights.length!==37||weights.some(w=>!Number.isSafeInteger(w)||w<0||w>100)||weights.reduce((s,w)=>s+w,0)===0)throw new Error('Set 37 pocket weights from 0 to 100, with at least one non-zero weight.');return [...weights];}
export function strictBets(bets){
 if(!bets||typeof bets!=='object'||Array.isArray(bets)||!Object.keys(bets).length)throw new Error('Place at least one roulette bet.');
 const valid=new Set(markets.map(m=>m.label));const clean={};
 for(const label of Object.keys(bets).sort()){const amount=bets[label];if(!valid.has(label)||!Number.isSafeInteger(amount)||amount<=0||amount>1000000)throw new Error('Invalid roulette market or amount.');clean[label]=amount;}
 return clean;
}
export function weightedPocket(weights,draw){const total=weights.reduce((s,w)=>s+w,0);if(!Number.isInteger(draw)||draw<0||draw>=total)throw new Error('Invalid roulette draw.');let cursor=0;for(let i=0;i<37;i++){cursor+=weights[i];if(draw<cursor)return i;}throw new Error('Invalid wheel configuration.');}
export function resolveRoulette(game,inputBets,draw){
 if(game.status!=='active')throw new Error('This game is paused.');
 const pocketWeights=validateWeights(game.pocketWeights),bets=strictBets(inputBets);const result=weightedPocket(pocketWeights,draw);const {wagered,payout,net}=settleRound(bets,result);
 if(wagered<game.minBet||wagered>game.maxBet)throw new Error(`Total bet must be ${game.minBet}–${game.maxBet} whole coins.`);
 return {bet:wagered,payout,outcome:net>0?'win':net<0?'loss':'push',choice:Object.entries(bets).map(([k,v])=>`${k}:${v}`).join(', '),bets,result,resultColor:resultColor(result),pocketWeights,winProbability:null,payoutMultiplier:null,revision:game.revision};
}
