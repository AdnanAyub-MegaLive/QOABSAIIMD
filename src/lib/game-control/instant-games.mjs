export const instantGames = {
  highlow: { id: 'dice-high-low', name: 'Dice High / Low', icon: '⚄', choices: ['low', 'high'], drawSize: 6, chance: '50%', payout: '1.9×', rules: 'Low wins on 1–3. High wins on 4–6. Each face is equally likely. A win returns 1.9× your stake.' },
  wheel: { id: 'lucky-wheel', name: 'Lucky Wheel', icon: '✺', choices: ['spin'], drawSize: 20, chance: '40%', payout: '1–8×', rules: '20 equal sectors: twelve 0×, four 1×, two 2×, one 3× and one 8×. A 1× result returns your stake.' },
  dragon: { id: 'dragon-vs-tiger', name: 'Dragon vs Tiger', icon: '🐉', choices: ['dragon', 'tiger'], drawSize: 169, chance: '53.85%', payout: '1.9×', rules: 'Two independent ranks from A (1) to K (13). Higher rank wins at 1.9×. Equal ranks return your stake.' },
  slots: { id: 'mini-slot', name: 'Mini Slot', icon: '🎰', choices: ['spin'], drawSize: 64, chance: '62.5%', payout: '1–6×', rules: 'Three independent reels, each with four equally likely symbols. Three matching symbols pay 6×; exactly two matching pay 1×; otherwise 0×.' },
  rps: { id: 'rock-paper-scissors', name: 'Rock Paper Scissors', icon: '✂', choices: ['rock', 'paper', 'scissors'], drawSize: 3, chance: '66.67%', payout: '1.9×', rules: 'Rock beats scissors, scissors beats paper, paper beats rock. Opponent choices are equally likely. Win pays 1.9×; a tie returns your stake.' },
};
export const supportedEngines = ['flip', 'roulette', ...Object.keys(instantGames)];
export const newGameDefaults = Object.entries(instantGames).map(([engine, spec]) => ({ id: spec.id, name: spec.name, engine, status: 'active', category: 'Instant', color: 'purple', minBet: 10, maxBet: 1000, revision: 1, winProbability: null, payoutMultiplier: null }));
export function resolveInstant(game, bet, choice, draw) {
  const spec = instantGames[game.engine];
  if (!spec || !spec.choices.includes(choice)) throw new Error('Choose a valid option for this game.');
  if (!Number.isInteger(draw) || draw < 0 || draw >= spec.drawSize) throw new Error('Invalid random draw.');
  let multiplier = 0, result;
  if (game.engine === 'highlow') {
    result = String(draw + 1);
    multiplier = ((draw < 3) === (choice === 'low')) ? 1.9 : 0;
  } else if (game.engine === 'wheel') {
    multiplier = [0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,2,2,3,8][draw];
    result = `${multiplier}×`;
  } else if (game.engine === 'dragon') {
    const dragon = Math.floor(draw / 13) + 1, tiger = draw % 13 + 1;
    multiplier = dragon === tiger ? 1 : ((dragon > tiger) === (choice === 'dragon')) ? 1.9 : 0;
    result = `${dragon} · ${tiger}`;
  } else if (game.engine === 'slots') {
    const reels = [Math.floor(draw / 16), Math.floor(draw / 4) % 4, draw % 4];
    multiplier = new Set(reels).size === 1 ? 6 : new Set(reels).size === 2 ? 1 : 0;
    result = reels.map(n => ['🍒', '🍋', '🔔', '⭐'][n]).join(' ');
  } else {
    result = spec.choices[draw];
    multiplier = result === choice ? 1 : ({ rock: 'scissors', paper: 'rock', scissors: 'paper' }[choice] === result ? 1.9 : 0);
  }
  const payout = Math.floor(bet * Math.round(multiplier * 100) / 100);
  return { bet, choice, result, payout, outcome: payout > bet ? 'win' : payout === bet ? 'push' : 'loss', payoutMultiplier: multiplier, winProbability: null, revision: game.revision };
}
