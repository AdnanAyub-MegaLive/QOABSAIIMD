import { createHash, generateKeyPairSync } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../prisma.js", () => ({ prisma: {} }));
vi.mock("../mobile-session-state.js", () => ({ assertMobileSession: () => {} }));

const { buildGameUrl, handleCallback, tulasiUid, updateBalance, userInformation, updateGameList } = await import("./service.js");
const { decryptBigData, encryptBigData } = await import("./crypto.js");

const TOKEN = "t".repeat(43);
const hash = (v) => createHash("sha256").update(v).digest("hex");

function fakeDb({ coins = 1000n } = {}) {
  const state = { coins, ledger: [] };
  const user = { id: "u1", publicId: "USR-100123", name: "Demo", profileImage: null, status: "ACTIVE" };
  const db = {
    state,
    tulasiSession: { findUnique: async ({ where }) => where.tokenHash === hash(TOKEN) ? { userId: "u1", roomId: "R1", claims: { userId: "USR-100123" }, expiresAt: new Date(Date.now() + 60000) } : null },
    user: {
      findUnique: async () => ({ ...user, coinBalance: state.coins }),
      updateMany: async ({ where, data }) => { if (state.coins < where.coinBalance.gte) return { count: 0 }; state.coins -= data.coinBalance.decrement; return { count: 1 }; },
      update: async ({ data }) => { state.coins += data.coinBalance.increment; },
    },
    walletTransaction: {
      findUnique: async ({ where }) => state.ledger.find((r) => r.type === where.userId_type_referenceId.type && r.referenceId === where.userId_type_referenceId.referenceId) ?? null,
      create: async ({ data }) => { state.ledger.push(data); return data; },
    },
    tulasiGame: { upsert: vi.fn(async () => ({})) },
  };
  db.$transaction = (fn) => fn(db);
  return db;
}

const now = 1_800_000_000_000;
const bet = (extra = {}) => ({ token: TOKEN, uid: tulasiUid("USR-100123"), transactionId: "1255759810054324225", type: 0, coin: 100, timestamp: now, gameEndTimestamp: now + 5000, gameId: "58", gameType: "kingdoms", ...extra });

describe("tulasi service", () => {
  let db;
  beforeEach(() => { db = fakeDb(); });

  it("maps public ids to collision-free numeric uids", () => {
    expect(tulasiUid("USR-100123")).toBe(1_000_000_100_123);
    expect(tulasiUid("TLN-100123")).not.toBe(tulasiUid("USR-100123"));
  });

  it("returns user information for a valid launch token", async () => {
    expect(await userInformation({ token: TOKEN }, db)).toMatchObject({ coin: 1000, gameCoin: 0, nickname: "Demo", avatar: "" });
    await expect(userInformation({ token: "x".repeat(43) }, db)).rejects.toThrow("Session expired.");
  });

  it("debits once per transactionId", async () => {
    expect(await updateBalance(bet(), db, now)).toMatchObject({ coin: 900 });
    expect(await updateBalance(bet(), db, now)).toMatchObject({ coin: 900 });
    expect(db.state.ledger).toHaveLength(1);
    expect(db.state.ledger[0].metadata.gameEndTimestamp).toBe(now + 5000);
    expect(db.state.ledger[0]).toMatchObject({ type: "GAME_WAGER", direction: "DEBIT", referenceId: "tulasi:1255759810054324225" });
  });

  it("credits winnings", async () => {
    expect(await updateBalance(bet({ type: 1, coin: 250, transactionId: "2" }), db, now)).toMatchObject({ coin: 1250 });
  });

  it("rejects insufficient balance, timeouts, uid mismatch and game coin", async () => {
    await expect(updateBalance(bet({ coin: 5000 }), db, now)).rejects.toThrow("Insufficient balance.");
    await expect(updateBalance(bet({ gameEndTimestamp: now }), db, now)).rejects.toThrow("game timeout");
    await expect(updateBalance(bet({ timestamp: now - 3000 }), db, now)).rejects.toThrow("request timeout");
    await expect(updateBalance(bet({ uid: 42 }), db, now)).rejects.toThrow("uid does not match token.");
    await expect(updateBalance(bet({ type: 2 }), db, now)).rejects.toThrow("Game coin is not supported.");
    expect(db.state.coins).toBe(1000n);
  });

  it("upserts synced games", async () => {
    await updateGameList([{ id: 58, name: "Kingdoms", gameIdentification: "kingdoms", status: 1, image: "https://x/i.png", banner: "https://x/b.png", expirationDate: "2026-12-31 23:59:59" }], db);
    expect(db.tulasiGame.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { tulasiId: 58 } }));
  });

  it("builds the provider game link", () => {
    expect(buildGameUrl({ gameDomain: "https://gamesp.tulasigame.com/", gameIdentification: "kingdoms", merchantId: "1000002", gameId: 58, token: "TOK", ext: "UjE" }))
      .toBe("https://gamesp.tulasigame.com/kingdoms/?merchant=1000002&gameId=58&lang=en&isLandscape=false&roomId=111&token=TOK&ext=UjE");
  });

  it("decrypts callbacks and encrypts responses", async () => {
    const platform = generateKeyPairSync("rsa", { modulusLength: 2048, publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } });
    const merchant = generateKeyPairSync("rsa", { modulusLength: 2048, publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } });
    const config = { enabled: true, platformPublicKey: platform.publicKey, merchantPrivateKey: merchant.privateKey };
    const bad = await handleCallback("userInformation", "garbage", config);
    expect(bad.body.code).toBe(0);
    const unknown = await handleCallback("nope", "", config);
    expect(unknown.status).toBe(404);
    const list = await handleCallback("updateGameList", encryptBigData(merchant.publicKey, "[]"), config);
    expect(list.body).toEqual({ code: 1, msg: "success", data: "" });
    expect(decryptBigData(platform.privateKey, encryptBigData(platform.publicKey, "{}"))).toBe("{}");
  });
});
