import { createHash, randomBytes } from "node:crypto";
import { prisma } from "../prisma.js";
import { assertMobileSession } from "../mobile-session-state.js";
import { ledgerData } from "../wallet.js";
import { decryptBigData, encryptBigData } from "./crypto.js";
import { TULASI_LANGS, TULASI_ROOM_ID, tulasiConfig } from "./config.js";

const SESSION_MS = 2 * 60 * 60 * 1000;
const MAX_BODY = 256 * 1024;
const DEBIT_CLOCK_SKEW_MS = 2000;
const hash = (value) => createHash("sha256").update(value).digest("hex");

export class TulasiError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

// Tulasi needs a numeric (Long) user id. Public ids look like USR-123456 / TLN-123456;
// prefix them so ids from different number sequences can never collide.
const PREFIX_BASE = { USR: 1, TLN: 2, AGN: 3 };
export function tulasiUid(publicId) {
  const match = /^([A-Z]+)-(\d{1,12})$/.exec(String(publicId ?? ""));
  if (!match) throw new TulasiError("User cannot play provider games.", 403);
  const base = PREFIX_BASE[match[1]] ?? 9;
  return base * 1e12 + Number(match[2]);
}

export function toBase64Url(text) { return Buffer.from(String(text), "utf8").toString("base64url"); }

export function buildGameUrl({ gameDomain, gameIdentification, merchantId, gameId, token, lang = "en", landscape = false, ext }) {
  const base = new URL(`${encodeURIComponent(gameIdentification)}/`, gameDomain);
  base.searchParams.set("merchant", merchantId);
  base.searchParams.set("gameId", String(gameId));
  base.searchParams.set("lang", TULASI_LANGS.has(lang) ? lang : "en");
  base.searchParams.set("isLandscape", landscape ? "true" : "false");
  base.searchParams.set("roomId", String(TULASI_ROOM_ID));
  base.searchParams.set("token", token);
  if (ext) base.searchParams.set("ext", ext);
  return base.toString();
}

/** Called by the mobile launch API after the user and room have been checked. */
export async function createLaunch({ user, claims, game, roomId, lang }, db = prisma) {
  const config = tulasiConfig();
  if (!config.enabled) throw new TulasiError("Provider games are not configured.", 503);
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Math.min(claims.exp * 1000, Date.now() + SESSION_MS));
  await db.tulasiSession.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await db.tulasiSession.create({ data: { tokenHash: hash(token), userId: user.id, claims, roomId, gameId: game.tulasiId, expiresAt } });
  const url = buildGameUrl({
    gameDomain: game.gameDomain || config.gameDomain,
    gameIdentification: game.gameIdentification,
    merchantId: config.merchantId,
    gameId: game.tulasiId,
    token,
    lang,
    ext: toBase64Url(roomId),
  });
  return { url, expiresAt };
}

async function sessionUser(tx, token) {
  if (typeof token !== "string" || token.length < 20 || token.length > 200) throw new TulasiError("Invalid token.", 401);
  const session = await tx.tulasiSession.findUnique({ where: { tokenHash: hash(token) } });
  if (!session || session.expiresAt <= new Date()) throw new TulasiError("Session expired.", 401);
  const user = await tx.user.findUnique({ where: { id: session.userId }, select: { id: true, publicId: true, name: true, profileImage: true, coinBalance: true, status: true, deletedAt: true, sessionVersion: true, forcedLogoutAt: true } });
  if (!user || user.publicId !== session.claims.userId) throw new TulasiError("User not found.", 401);
  try { assertMobileSession(user, session.claims); } catch { throw new TulasiError("Session revoked.", 401); }
  if (session.claims.deviceId) {
    const device = await tx.device.findUnique({ where: { userId_macAddress: { userId: user.id, macAddress: session.claims.deviceId } }, select: { isBanned: true } });
    if (!device || device.isBanned) throw new TulasiError("Device not allowed.", 403);
  }
  return { session, user };
}

export async function userInformation(input, db = prisma) {
  const { user } = await sessionUser(db, input.token);
  return {
    id: tulasiUid(user.publicId),
    nickname: user.name || user.publicId,
    avatar: user.profileImage || "",
    coin: Number(user.coinBalance),
    gameCoin: 0,
  };
}

function positiveCoins(value) {
  const n = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  if (!Number.isSafeInteger(n) || n < 0) throw new TulasiError("Invalid coin amount.");
  return BigInt(n);
}

export async function updateBalance(input, db = prisma, now = Date.now()) {
  const type = Number(input.type);
  if (type !== 0 && type !== 1) throw new TulasiError("Game coin is not supported.");
  const transactionId = String(input.transactionId ?? "");
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(transactionId)) throw new TulasiError("Invalid transactionId.");
  const coins = positiveCoins(input.coin);
  const referenceId = `tulasi:${transactionId}`;
  const ledgerType = type === 0 ? "GAME_WAGER" : "GAME_PAYOUT";

  return db.$transaction(async (tx) => {
    const { session, user } = await sessionUser(tx, input.token);
    if (String(input.uid) !== String(tulasiUid(user.publicId))) throw new TulasiError("uid does not match token.", 403);

    const existing = await tx.walletTransaction.findUnique({ where: { userId_type_referenceId: { userId: user.id, type: ledgerType, referenceId } }, select: { id: true } });
    const balance = async () => (await tx.user.findUnique({ where: { id: user.id }, select: { coinBalance: true } })).coinBalance;
    if (existing) return { id: tulasiUid(user.publicId), coin: Number(await balance()) };

    if (type === 0) {
      const end = Number(input.gameEndTimestamp);
      const sent = Number(input.timestamp);
      if (!Number.isFinite(end) || now >= end) throw new TulasiError("game timeout");
      if (!Number.isFinite(sent) || Math.abs(now - sent) > DEBIT_CLOCK_SKEW_MS) throw new TulasiError("request timeout");
      if (coins > 0n) {
        const debit = await tx.user.updateMany({ where: { id: user.id, coinBalance: { gte: coins } }, data: { coinBalance: { decrement: coins } } });
        if (!debit.count) throw new TulasiError("Insufficient balance.");
      }
    } else if (coins > 0n) {
      await tx.user.update({ where: { id: user.id }, data: { coinBalance: { increment: coins } } });
    }

    await tx.walletTransaction.create({ data: ledgerData({
      userId: user.id,
      type: ledgerType,
      direction: type === 0 ? "DEBIT" : "CREDIT",
      title: type === 0 ? "Game bet" : "Game win",
      description: String(input.gameType ?? "").slice(0, 100) || null,
      coins,
      referenceId,
      metadata: { provider: "TULASI", gameId: String(input.gameId ?? ""), gameType: input.gameType ?? null, roomId: session.roomId, gameStartTimestamp: input.gameStartTimestamp ?? null, remark: input.remark ?? null },
    }) });
    return { id: tulasiUid(user.publicId), coin: Number(await balance()) };
  });
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(String(value).replace(" ", "T") + "Z");
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function updateGameList(items, db = prisma) {
  if (!Array.isArray(items)) throw new TulasiError("Game list must be an array.");
  for (const item of items) {
    const tulasiId = Number(item?.id);
    if (!Number.isSafeInteger(tulasiId) || typeof item.name !== "string") continue;
    const data = {
      name: item.name.slice(0, 100),
      gameIdentification: String(item.gameIdentification || "").slice(0, 100),
      description: item.description ? String(item.description).slice(0, 500) : null,
      image: item.image || null,
      banner: item.banner || null,
      gameDomain: typeof item.gameDomain === "string" && item.gameDomain.startsWith("https://") ? item.gameDomain : null,
      providerStatus: Number(item.status) === 1 ? 1 : 0,
      expirationDate: parseDate(item.expirationDate),
      syncedAt: new Date(),
    };
    if (!data.gameIdentification) continue;
    await db.tulasiGame.upsert({ where: { tulasiId }, create: { tulasiId, ...data }, update: data });
  }
  return "";
}

const handlers = { userInformation, updateBalance, updateGameList };

/** Handles one encrypted callback from Tulasi and returns the plain response object. */
export async function handleCallback(action, rawBody, config = tulasiConfig()) {
  const handler = handlers[action];
  if (!handler) return { status: 404, body: { code: 0, msg: "Unknown action" } };
  if (!config.enabled) return { status: 503, body: { code: 0, msg: "Not configured" } };
  if (rawBody.length > MAX_BODY) return { status: 413, body: { code: 0, msg: "Body too large" } };
  let input;
  try { input = JSON.parse(decryptBigData(config.merchantPrivateKey, rawBody)); }
  catch { return { status: 400, body: { code: 0, msg: "Unable to decrypt request" } }; }
  try {
    const result = await handler(input);
    const data = action === "updateGameList" ? "" : encryptBigData(config.platformPublicKey, JSON.stringify(result));
    return { status: 200, body: { code: 1, msg: "success", data } };
  } catch (error) {
    if (!(error instanceof TulasiError)) console.error("Tulasi callback failed", action, error);
    return { status: 200, body: { code: 0, msg: error instanceof TulasiError ? error.message : "Server error" } };
  }
}
