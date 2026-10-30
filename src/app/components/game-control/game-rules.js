import { playerRules } from '@/lib/game-control/player-rules.mjs';
import {pizzaFoods,pizzaSettings} from '@/lib/game-control/pizza.mjs';
import { outcomeOddsText } from '@/lib/game-control/outcome-weights.mjs';
export default function GameRules({ game }) {
 let odds=game?outcomeOddsText(game):'';
 if(game?.engine==='flip')odds=`Heads ${game.winProbability}%; Tails ${100-game.winProbability}%.`;
 if(game?.engine==='roulette'&&game.pocketWeights){const sum=game.pocketWeights.reduce((a,b)=>a+b,0);odds=game.pocketWeights.map((w,n)=>`${n}: ${(w/sum*100).toFixed(2)}%`).join(' · ');}
 if(game?.engine==='pizza'){const weights=pizzaSettings(game).pizzaWeights,total=weights.reduce((a,b)=>a+b,0);odds=weights.map((w,i)=>`${pizzaFoods[i].name}: ${(w/total*100).toFixed(2)}%`).join(' · ');}
 return <><ol>{playerRules(game).map(rule=><li key={rule}>{rule}</li>)}</ol>{odds&&<details><summary>Current outcome chances</summary><p>{odds}</p></details>}</>;
}
