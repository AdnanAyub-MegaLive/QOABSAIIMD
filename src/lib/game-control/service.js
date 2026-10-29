import { createHash, randomInt, randomUUID } from "node:crypto";
import { prisma } from "../prisma.js";
import { assertMobileSession } from "../mobile-session-state.js";
import { validateGame, resolveRound } from "./rules.mjs";
import { resolveRoulette, strictBets } from "./roulette/engine.mjs";
import { miniGames, makeChallenge, publicChallenge, resolveMini } from "./mini-games.mjs";
import { selectTrivia } from "./trivia-rounds.mjs";
import { dealTeenPatti } from "./teen-patti.mjs";
import { notifyGameCatalogUpdated } from "../game-catalog-update.js";

export class GameError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export const defaultGames = [
  ...Object.entries(miniGames).map(([engine, value]) => ({ id: ({rocket:"rocket",highlow:"dice-high-low",wheel:"lucky-wheel",dragon:"dragon-vs-tiger",slots:"mini-slot",pizza:"pizza",rps:"rock-paper-scissors",dice:"lucky-dice",penalty:"penalty-shootout",reaction:"reaction-race",trivia:"trivia-battle",teenpatti:"teen-patti"})[engine], name: value.name, engine, status: "paused", minBet: 10, maxBet: 10000 })),
  { id: "lucky-flip", name: "Lucky Flip", engine: "flip", status: "paused", winProbability: 45, payoutMultiplier: 2, minBet: 10, maxBet: 1000 },
  { id: "roulette", name: "Roulette", engine: "roulette", status: "paused", pocketWeights: Array(37).fill(1), minBet: 10, maxBet: 1000 },
];
export const serializeGame = (row) => ({ ...row.settings, id: row.id, revision: row.revision, archivedAt: row.archivedAt?.toISOString() ?? null });
export async function ensureGames() {
  for (const game of defaultGames) await prisma.gameDefinition.upsert({ where: { id: game.id }, create: { id: game.id, settings: validateGame(game) }, update: {} });
}
export async function saveGame(input, actor) {
  let settings;
  try { settings = validateGame(input); } catch (error) { throw new GameError(error.message); }
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "GameDefinition" WHERE id = ${settings.id} FOR UPDATE`;
    const beforeRow = await tx.gameDefinition.findUnique({ where: { id: settings.id } });
    if (beforeRow?.archivedAt) throw new GameError("This catalogue entry is archived.", 409);
    if (beforeRow && input.revision !== beforeRow.revision) throw new GameError("Settings changed in another session. Reload before saving.", 409);
    if (!beforeRow && input.revision) throw new GameError("Game not found.", 404);
    if (beforeRow && beforeRow.settings.engine !== settings.engine) throw new GameError("An existing game's engine cannot be changed.", 409);
    const revision = (beforeRow?.revision || 0) + 1;
    const row = beforeRow
      ? await tx.gameDefinition.update({ where: { id: settings.id }, data: { settings, revision } })
      : await tx.gameDefinition.create({ data: { id: settings.id, settings, revision } });
    const game = serializeGame(row);
    const audit = { id: randomUUID(), gameId: game.id, gameName: game.name, actor, action: beforeRow ? "Settings updated" : "Game created", before: beforeRow ? serializeGame(beforeRow) : null, after: game, createdAt: new Date().toISOString() };
    await tx.gameSettingsAudit.create({ data: { id: audit.id, gameId: game.id, payload: audit } });
    await tx.auditLog.create({ data: { action: "GAME_SETTINGS_UPDATED", category: "GAME_MANAGEMENT", entityType: "GameDefinition", entityId: game.id, description: `${actor} saved ${game.name} revision ${revision}.`, metadata: audit } });
    return { game, audit };
  });
  await notifyGameCatalogUpdated(prisma, [result.game.id]);
  return result;
}

export async function assertPlayer(tx, identity) {
  if (identity.expiresAt <= new Date() || identity.claims.exp <= Math.floor(Date.now() / 1000)) throw new GameError("Your game session expired. Reopen the game from Mega Live.", 401);
  const user = await tx.user.findUnique({ where: { id: identity.userId } });
  if (user?.publicId !== identity.claims.userId) throw new GameError("Your game identity is no longer valid. Sign in again.", 401);
  try { assertMobileSession(user, identity.claims); } catch { throw new GameError("Your session has been revoked. Sign in again in Mega Live.", 401); }
  if (identity.claims.deviceId) {
    const device = await tx.device.findUnique({ where: { userId_macAddress: { userId: user.id, macAddress: identity.claims.deviceId } } });
    if (!device || device.isBanned) throw new GameError("This device is not allowed to play.", 403);
  }
  return user;
}

export function acceptedRequest(input, roomId) {
  if (!input || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.id || "")) throw new GameError("A UUID operation ID is required.");
  if (typeof input.gameId !== "string" || !Number.isSafeInteger(input.revision) || input.revision < 1 || !Number.isSafeInteger(input.bet) || input.bet < 1) throw new GameError("Invalid wager or game revision.");
  let bets = null;
  if (input.bets !== undefined) {
    try { bets = strictBets(input.bets); } catch (error) { throw new GameError(error.message); }
  }
  return { gameId: input.gameId, revision: input.revision, bet: input.bet, choice: bets ? null : input.choice ?? null, bets, roomId: roomId || null };
}
export async function placeRound(identity, input) {
  const request = acceptedRequest(input, identity.roomId);
  const requestHash = createHash("sha256").update(JSON.stringify(request)).digest("hex");
  return prisma.$transaction(async (tx) => {
    // Consistent lock order serializes acceptance with settings edits and wallet changes.
    await tx.$queryRaw`SELECT id FROM "GameDefinition" WHERE id = ${request.gameId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${identity.userId} FOR UPDATE`;
    const user = await assertPlayer(tx, identity);
    const existing = await tx.gamePlayRound.findUnique({ where: { id: input.id } });
    if (existing) {
      if (existing.userId !== user.id || existing.requestHash !== requestHash) throw new GameError("This operation ID was already used for a different wager.", 409);
      return existing.payload;
    }
    const row = await tx.gameDefinition.findUnique({ where: { id: request.gameId } });
    if (!row) throw new GameError("Game not found.", 404);
    const game = serializeGame(row);
    if (request.revision !== game.revision) throw new GameError("Game settings changed. Refresh before betting.", 409);
    if (game.engine === "external") throw new GameError("Linked games do not support portal wagers.", 400);
    if (game.status !== "active") throw new GameError("This game is paused.", 409);
    let result;
    try {
      let challenge;
      if (["reaction", "trivia"].includes(game.engine)) {
        const saved = await tx.gamePlayChallenge.findUnique({where:{id:input.id}});
        challenge=saved?.payload;
        if (!saved || saved.userId !== user.id || challenge.gameId !== game.id || challenge.revision !== game.revision || challenge.roomId !== identity.roomId || challenge.bet!==request.bet) throw new Error("Invalid challenge. Start a new round.");
      }
      if(game.engine==="rocket")throw new GameError("Rocket requires shared room rounds.",409);
      result = miniGames[game.engine] ? resolveMini(game, request.bet, request.choice, randomInt(120000), challenge, Date.now(), game.engine==="teenpatti"?dealTeenPatti(randomInt):undefined) : game.engine === "roulette"
        ? resolveRoulette(game, request.bets, randomInt(game.pocketWeights.reduce((sum, weight) => sum + weight, 0)))
        : resolveRound(game, request.bet, request.choice, randomInt(10000));
    } catch (error) { throw new GameError(error.message); }
    if (result.bet !== request.bet) throw new GameError("The total wager does not match the selected bets.");
    const account = await tx.gamePlayAccount.upsert({ where: { userId: user.id }, create: { userId: user.id }, update: {} });
    if (account.points < BigInt(result.bet)) throw new GameError("Not enough free points. Use Free refill to start again.", 409);
    const round = { id: input.id, uid: user.publicId, nickname: user.name, roomId: identity.roomId, gameId: game.id, gameName: game.name, ...result, settings: game, status: "settled", createdAt: new Date().toISOString() };
    // This currency has no wallet, XP, props, reward or redemption integration.
    const points = account.points - BigInt(result.bet) + BigInt(result.payout);
    if (points > 9007199254740991n) throw new GameError("Free point limit reached.", 409);
    await tx.gamePlayAccount.update({ where: { userId: user.id }, data: { points } });
    round.currency = "PLAY_POINTS";
    round.availablePoints = points.toString();
    await tx.gamePlayRound.create({ data: { id: round.id, userId: user.id, requestHash, payload: round, createdAt: new Date(round.createdAt) } });
    return round;
  }, { timeout: 15000 });
}

export async function startChallenge(identity, input) {
  return prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM "GameDefinition" WHERE id = ${input.gameId} FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${identity.userId} FOR UPDATE`;
  await assertPlayer(tx, identity);
  const row = await tx.gameDefinition.findUnique({ where: { id: input.gameId } });
  if (!row) throw new GameError("Game not found.", 404);
  const game = serializeGame(row);
  if (game.status !== "active") throw new GameError("Game paused.", 409);
  if(!Number.isSafeInteger(input.bet)||input.bet<game.minBet||input.bet>game.maxBet)throw new GameError("Choose points within this game's limits.");
  if(input.custom!==undefined&&typeof input.custom!=="boolean")throw new GameError("Invalid amount selection.");
  const now = Date.now(), id = randomUUID();
  let challenge;
  if(game.engine==="trivia"){
    const history=await tx.gameTriviaHistory.findUnique({where:{userId:identity.userId}});
    const selected=selectTrivia(input.bet,input.custom===true,history?.seen||{},randomInt);
    await tx.gameTriviaHistory.upsert({where:{userId:identity.userId},create:{userId:identity.userId,seen:selected.history},update:{seen:selected.history}});
    challenge={tier:selected.tier,questions:selected.questions,expiresAt:now+selected.questions.length*(game.triviaSeconds??20)*1000};
  }else {try { challenge = makeChallenge(game.engine, randomInt(120000), now); } catch (error) { throw new GameError(error.message); }}
  await tx.gamePlayChallenge.deleteMany({where:{userId:identity.userId,expiresAt:{lt:new Date(now-86400000)}}});
  await tx.gamePlayChallenge.create({data:{id,userId:identity.userId,payload:{...challenge,gameId:game.id,revision:game.revision,roomId:identity.roomId,bet:input.bet},expiresAt:new Date(challenge.expiresAt)}});
  const display=game.engine==="trivia"?{tier:challenge.tier,questions:challenge.questions.map(({id,text,options})=>({id,text,options})),expiresAt:challenge.expiresAt}:publicChallenge(game.engine,challenge);
  return { id, revision: game.revision, serverTime: now, ...display };
  });
}
