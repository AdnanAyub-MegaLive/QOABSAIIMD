import { pizzaFoods, pizzaSettings } from './pizza.mjs';
export function playerRules(game = {}) {
 const returns = game.pointReturnMultiplier ?? (game.engine === 'dice' ? 6 : game.engine === 'teenpatti' ? 3 : 2);
 const rules = {
  roulette: ['Choose a coin amount, tap one or more markets, then tap Place bet before betting closes. You may add more bets while the timer is open.', 'The wheel has 37 pockets: 0–36. The number under the gold pointer is the winning result.', 'Zero returns 36×. A winning dozen returns 3×. Red, Black, Odd and Even return 2×. Zero loses on every market except Zero. Each selected market settles separately.'],
  flip: ['Choose Heads or Tails and place your bet before the timer ends.', `Matching the revealed side returns ${game.payoutMultiplier ?? 2}× your stake. The other side loses.`],
  highlow: ['Choose Low (1–3) or High (4–6). A matching die result returns 1.9× your stake.'],
  wheel: ['Place your bet before the spin. Your stake is multiplied by the winning sector: 0×, 1×, 2×, 3× or 8×. A 1× result returns your stake.'],
  dragon: ['Choose Dragon or Tiger. The higher card rank wins; Ace is 1 and King is 13. A win returns 1.9×. Equal ranks return your stake.'],
  slots: ['Place your bet before the reels spin. Three matching symbols return 6×; exactly two matching symbols return 1×; no match returns zero.'],
  dice: [`Choose a number from 1 to 6. A matching die returns ${returns}× your stake; other numbers lose.`],
  rps: [`Rock beats Scissors, Scissors beats Paper, and Paper beats Rock. A win returns ${returns}×; a tie returns your stake.`],
  penalty: [`Choose Left, Centre or Right. Score when the goalkeeper dives in a different direction to return ${returns}×. A matching direction loses.`],
  teenpatti: ['Choose Hand 1, 2 or 3 before the cards are revealed. The strongest of the three hands wins. All tied strongest hands count as winners.', `Trail > Pure Sequence > Sequence > Colour > Pair > High Card. AKQ is the highest sequence, followed by A23. Suits do not break ties. Each winning selection returns ${returns}×.`],
  reaction: ['Place your bet, wait for the green TAP NOW signal, then tap once. An early tap or no tap loses.', `A response within ${game.reactionWindowMs ?? 1000} ms returns ${returns}×. The server receives and times your tap, so network delay counts.`],
  trivia: ['Place your bet, then answer every question before the playing timer ends. All answers must be correct to win.', `10–100 coins: one easy question. 500: two medium. 1,000: three hard. Custom amounts and other stakes: five expert questions. A win returns ${returns}×.`],
  rocket: [`Board before launch. One entry per flight. The multiplier starts at 0× and may crash anywhere up to ${game.rocketMaxMultiplier ?? 5}×.`, 'Cash out before the crash to receive your stake multiplied by the server-confirmed multiplier. Below 1× returns less than your stake. Staying aboard at the crash returns zero; there is no automatic cash-out at the maximum.'],
 };
 if(game.engine==='pizza')rules.pizza=['Choose a food before the spin. A matching food wins; other selections lose.',pizzaFoods.map((f,i)=>`${f.label ?? f.name ?? f.id}: ${pizzaSettings(game).pizzaReturns[i]}×`).join(' · ')];
 return [...(rules[game.engine] || ['Place your bet before the betting timer ends.']), 'Bet any positive whole-coin amount up to your available balance. All returns include the stake; losing bets return zero. Fractional coin returns are rounded down.', 'Saved rule changes apply from the next round. Bets already accepted keep their original rules.'];
}
