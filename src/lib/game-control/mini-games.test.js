import { expect, it } from "vitest";
import { miniGames, makeChallenge, publicChallenge, resolveMini } from "./mini-games.mjs";
import { validateGame } from "./rules.mjs";
const game = engine => ({ id: "test-game", name: "Test", engine, status: "active", minBet: 10, maxBet: 1000, revision: 1 });
it("validates all five engines without configurable fake win odds", () => { for (const engine of Object.keys(miniGames)) expect(validateGame(game(engine)).engine).toBe(engine); });
it("RPS wins, loses and draws according to standard rules", () => {
  expect(resolveMini(game("rps"),100,"paper",0).payout).toBe(200);
  expect(resolveMini(game("rps"),100,"scissors",0).payout).toBe(0);
  expect(resolveMini(game("rps"),100,"rock",0).payout).toBe(100);
});
it("dice and penalty use the actual result", () => {
  expect(resolveMini(game("dice"),100,"6",5).payout).toBe(600);
  expect(resolveMini(game("dice"),100,"5",5).payout).toBe(0);
  expect(resolveMini(game("penalty"),100,"left",0).payout).toBe(0);
  expect(resolveMini(game("penalty"),100,"right",0).payout).toBe(200);
});
it("reaction rejects early taps and checks server timing", () => {
  const challenge = makeChallenge("reaction",0,10000);
  expect(resolveMini(game("reaction"),100,"tap",0,challenge,11999).payout).toBe(0);
  expect(resolveMini(game("reaction"),100,"tap",0,challenge,12500).payout).toBe(200);
  expect(resolveMini(game("reaction"),100,"tap",0,challenge,13001).payout).toBe(0);
});
it("trivia sends no answer field and rejects expired questions", () => {
  const challenge = makeChallenge("trivia",0,10000);
  expect(publicChallenge("trivia",challenge)).not.toHaveProperty("answer");
  expect(resolveMini(game("trivia"),100,"1",0,challenge,11000).payout).toBe(200);
  expect(() => resolveMini(game("trivia"),100,"1",0,challenge,26000)).toThrow("expired");
});
it("rejects paused games, invalid choices and invalid point amounts", () => {
  expect(() => resolveMini({...game("dice"),status:"paused"},100,"1",0)).toThrow();
  expect(() => resolveMini(game("dice"),100,"7",0)).toThrow();
  expect(() => resolveMini(game("rps"),-1,"rock",0)).toThrow();
});
