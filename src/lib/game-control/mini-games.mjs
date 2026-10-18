import {pizzaFoods,pizzaSettings,pizzaResult} from "./pizza.mjs";
export const miniGames = {
  pizza: {name:"Pizza",choices:pizzaFoods.map(f=>f.id),icon:"🍕",help:"Choose a food. Everyone in the room sees the same winning food. Returns and selection weights are configured by the admin. Free points only."},
  teenpatti: { name: "Teen Patti", choices: ["deal"], icon: "♠", help: "Solo three-card showdown versus the computer. Trail > pure sequence > sequence > colour > pair > high card. AKQ is the highest sequence, A23 second. Suits do not break ties. No betting streets or cash prizes." },
  rps: { name: "Rock–Paper–Scissors", choices: ["rock", "paper", "scissors"], icon: "✊", help: "Play against the computer. Rock beats scissors, scissors beats paper, paper beats rock. A draw returns your points." },
  dice: { name: "Lucky Dice", choices: ["1", "2", "3", "4", "5", "6"], icon: "⚄", help: "Pick a number from 1 to 6. Match the die to return six times your free points." },
  penalty: { name: "Penalty Shootout", choices: ["left", "centre", "right"], icon: "⚽", help: "Choose where to shoot. Score when the computer goalkeeper dives elsewhere." },
  reaction: { name: "Reaction Race", choices: [], icon: "⚡", help: "Start, wait for green, then tap. Early taps lose. Respond within one second to win. Network latency is included; this is not a competitive timing leaderboard." },
  trivia: { name: "Trivia Battle", choices: [], icon: "?", help: "10–100 points: 1 easy question. 500: 2 medium. 1,000: 3 hard. Custom: 5 expert. All answers must be correct. No repeats until the difficulty pool is exhausted." },
};
export const questions = [
  { text: "Which planet is known as the Red Planet?", options: ["Venus", "Mars", "Jupiter", "Mercury"], answer: "1" },
  { text: "How many sides does a hexagon have?", options: ["Five", "Seven", "Eight", "Six"], answer: "3" },
  { text: "Which ocean is the largest?", options: ["Pacific", "Atlantic", "Indian", "Arctic"], answer: "0" },
  { text: "What is 12 × 8?", options: ["88", "108", "96", "86"], answer: "2" },
  { text: "Which gas do plants absorb for photosynthesis?", options: ["Oxygen", "Carbon dioxide", "Helium", "Hydrogen"], answer: "1" },
  { text: "How many minutes are in two hours?", options: ["60", "90", "100", "120"], answer: "3" },
  { text: "Which instrument has black and white keys?", options: ["Drum", "Flute", "Piano", "Violin"], answer: "2" },
  { text: "Which is the smallest prime number?", options: ["2", "0", "1", "4"], answer: "0" },
];
export function makeChallenge(engine, draw, now) {
  if (engine === "reaction") return { readyAt: now + 2000 + draw % 3000, expiresAt: now + 15000 };
  if (engine === "trivia") return { question: draw % questions.length, expiresAt: now + 15000 };
  throw new Error("This game does not need a challenge.");
}
export function publicChallenge(engine, challenge) {
  return engine === "reaction" ? { readyAt: challenge.readyAt, expiresAt: challenge.expiresAt } : { text: questions[challenge.question].text, options: questions[challenge.question].options, expiresAt: challenge.expiresAt };
}
export function resolveMini(game, bet, choice, draw, challenge, now = Date.now(), cards) {
  if (!miniGames[game.engine] || game.status !== "active") throw new Error("Game unavailable.");
  if (!Number.isSafeInteger(bet) || bet < game.minBet || bet > game.maxBet) throw new Error("Invalid free-point amount.");
  let won = false, tie = false, result, multiplier = 2;
  const choices = miniGames[game.engine].choices;
  if (choices.length && !choices.includes(choice)) throw new Error("Choose a valid option.");
  if (game.engine === "pizza") {
    const settings=pizzaSettings(game);result=pizzaResult(game,draw%settings.pizzaWeights.reduce((a,b)=>a+b,0));won=choice===result;multiplier=settings.pizzaReturns[pizzaFoods.findIndex(f=>f.id===choice)];
  } else if (game.engine === "teenpatti") {
    if(!cards) throw new Error("Missing card deal.");
    won=cards.compare>0;tie=cards.compare===0;result=`${cards.playerHand} vs ${cards.computerHand} · ${tie?"Draw":won?"You win":"Computer wins"}`;
  } else if (game.engine === "rps") {
    const opponent = choices[draw % 3]; tie = opponent === choice;
    won = (choices.indexOf(choice) - choices.indexOf(opponent) + 3) % 3 === 1;
    result = `Computer: ${opponent} · ${tie ? "Draw" : won ? "You win" : "Computer wins"}`;
  } else if (game.engine === "dice") { const die = String(draw % 6 + 1); won = choice === die; multiplier = 6; result = `Rolled ${die}`;
  } else if (game.engine === "penalty") { const keeper = choices[draw % 3]; won = keeper !== choice; result = `${won ? "Goal!" : "Saved!"} Keeper: ${keeper}`;
  } else {
    if (!challenge || now > challenge.expiresAt) throw new Error("Challenge expired. Start a new round.");
    if (game.engine === "reaction") {
      if (choice !== "tap") throw new Error("Tap the reaction pad.");
      const elapsed = now - challenge.readyAt; won = elapsed >= 0 && elapsed <= (game.reactionWindowMs ?? 1000);
      result = elapsed < 0 ? "Too early!" : `${elapsed} ms · ${won ? "Quick reaction!" : "Try again"}`;
    } else {
      if(challenge.questions){
        if(!Array.isArray(choice)||choice.length!==challenge.questions.length||choice.some(v=>!["0","1","2","3"].includes(v)))throw new Error("Answer every question.");
        const correct=choice.filter((answer,i)=>answer===challenge.questions[i].answer).length;
        won=correct===choice.length;result=`${correct}/${choice.length} correct · ${won?"Round won!":"Try another round"}`;
      } else {
        if (!["0", "1", "2", "3"].includes(choice) || !questions[challenge.question]) throw new Error("Invalid answer.");
        won = choice === questions[challenge.question].answer; result = won ? "Correct!" : "Not quite. Try another question.";
      }
    }
  }
  multiplier=game.engine==="pizza"?multiplier:game.pointReturnMultiplier??multiplier;
  return { bet, payout: tie ? bet : won ? Math.floor(bet * Math.round(multiplier*100)/100) : 0, outcome: tie ? "push" : won ? "win" : "loss", choice, result, revision: game.revision, ...(cards?{playerCards:cards.playerCards,computerCards:cards.computerCards}:{}) };
}
