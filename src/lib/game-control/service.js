import { createHash, randomInt, randomUUID } from "node:crypto";
import { prisma } from "../prisma.js";
import { ledgerData } from "../wallet.js";
import { assertMobileSession } from "../mobile-session-state.js";
import { validateGame, resolveRound } from "./rules.mjs";
import { resolveRoulette, strictBets } from "./roulette/engine.mjs";

export class GameError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export const defaultGames = [
  { id: "lucky-flip", name: "Lucky Flip", engine: "flip", status: "paused", winProbability: 45, payoutMultiplier: 2, minBet: 10, maxBet: 1000 },
  { id: "roulette", name: "Roulette", engine: "roulette", status: "paused", pocketWeights: Array(37).fill(1), minBet: 10, maxBet: 1000 },
];
export const serializeGame = (row) => ({ ...row.settings, id: row.id, revision: row.revision });
export async function ensureGames() {
  for (const game of defaultGames) await prisma.gameDefinition.upsert({ where: { id: game.id }, create: { id: game.id, settings: validateGame(game) }, update: {} });
}
export async function saveGame(input, actor) {
  let settings;
  try { settings = validateGame(input); } catch (error) { throw new GameError(error.message); }
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "GameDefinition" WHERE id = ${settings.id} FOR UPDATE`;
    const beforeRow = await tx.gameDefinition.findUnique({ where: { id: settings.id } });
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
    const existing = await tx.gameRound.findUnique({ where: { id: input.id } });
    if (existing) {
      if (existing.userId !== user.id || existing.requestHash !== requestHash) throw new GameError("This operation ID was already used for a different wager.", 409);
      return existing.payload;
    }
    const row = await tx.gameDefinition.findUnique({ where: { id: request.gameId } });
    if (!row) throw new GameError("Game not found.", 404);
    const game = serializeGame(row);
    if (request.revision !== game.revision) throw new GameError("Game settings changed. Refresh before betting.", 409);
    if (game.status !== "active") throw new GameError("This game is paused.", 409);
    let result;
    try {
      result = game.engine === "roulette"
        ? resolveRoulette(game, request.bets, randomInt(game.pocketWeights.reduce((sum, weight) => sum + weight, 0)))
        : resolveRound(game, request.bet, request.choice, randomInt(10000));
    } catch (error) { throw new GameError(error.message); }
    if (result.bet !== request.bet) throw new GameError("The total wager does not match the selected bets.");
    if (user.coinBalance < BigInt(result.bet)) throw new GameError("Not enough coins in your Mega Live wallet.", 409);
    const round = { id: input.id, uid: user.publicId, nickname: user.name, roomId: identity.roomId, gameId: game.id, gameName: game.name, ...result, settings: game, status: "settled", createdAt: new Date().toISOString() };
    await tx.user.update({ where: { id: user.id }, data: { coinBalance: { increment: BigInt(result.payout) - BigInt(result.bet) } } });
    const entries = [ledgerData({ userId: user.id, type: "GAME_WAGER", direction: "DEBIT", title: `${game.name} wager`, coins: BigInt(result.bet), referenceId: round.id, metadata: { gameId: game.id, revision: game.revision } })];
    if (result.payout > 0) entries.push(ledgerData({ userId: user.id, type: "GAME_PAYOUT", direction: "CREDIT", title: `${game.name} payout`, coins: BigInt(result.payout), referenceId: round.id, metadata: { gameId: game.id, revision: game.revision } }));
    await tx.walletTransaction.createMany({ data: entries });
    await tx.gameLog.create({ data: { userId: user.id, gameName: game.name, wager: BigInt(result.bet), payout: BigInt(result.payout), result: result.outcome, referenceId: round.id } });
    await tx.gameRound.create({ data: { id: round.id, gameId: game.id, userId: user.id, requestHash, payload: round, createdAt: new Date(round.createdAt) } });
    return round;
  }, { timeout: 15000 });
}
