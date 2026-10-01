// Local HTTP integration smoke test. Creates and removes its own player/game fixtures.
import { config } from "dotenv";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
config({ path: ".env.local", quiet: true });
const origin = process.env.AUTH_URL || "http://localhost:3000";
if (!["localhost", "127.0.0.1"].includes(new URL(origin).hostname)) throw new Error("This smoke test only runs against a local development portal.");
const { prisma } = await import("../src/lib/prisma.js");
const { default: mobile } = await import("../src/lib/mobile-session.cjs");
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const gameId = `test-http-${suffix}`;
let user;
try {
  user = await prisma.user.create({ data: { publicId: `USR-TEST-${suffix}`, name: "Game HTTP smoke test", coinBalance: 1000n } });
  await prisma.gameDefinition.create({ data: { id: gameId, settings: { id: gameId, name: "HTTP smoke test", engine: "flip", status: "active", winProbability: 100, payoutMultiplier: 2, minBet: 10, maxBet: 100 } } });
  const token = mobile.createMobileSessionToken(user);
  const post = (body, cookie = "", requestOrigin = origin) => fetch(`${origin}/api/games/player`, { method: "POST", headers: { "Content-Type": "application/json", Origin: requestOrigin, Cookie: cookie }, body: JSON.stringify(body) });
  assert.equal((await post({ action: "profile" })).status, 401);
  assert.equal((await post({ action: "launch", token }, "", "https://invalid.example")).status, 403);
  assert.equal((await post({ action: "launch", token: "invalid" })).status, 401);
  const launch = await post({ action: "launch", token });
  assert.equal(launch.status, 200, await launch.clone().text());
  const cookie = launch.headers.get("set-cookie").split(";")[0];
  const profile = await launch.json();
  assert.equal(profile.user.availableCoins, "1000");
  assert.ok(profile.games.some((g) => g.id === gameId));
  const catalog = await fetch(`${origin}/api/v1/games`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(catalog.status, 200);
  assert.ok((await catalog.json()).data.games.some((g) => g.id === gameId));
  const wager = { action: "bet", id: randomUUID(), gameId, revision: 1, bet: 100, choice: "heads" };
  const result = await post(wager, cookie);
  assert.equal(result.status, 200, await result.clone().text());
  assert.equal((await result.json()).round.payout, 200);
  assert.equal((await post(wager, cookie)).status, 200);
  assert.equal((await (await post({ action: "profile" }, cookie)).json()).user.availableCoins, "1100");
  assert.equal(await prisma.walletTransaction.count({ where: { userId: user.id } }), 2);
  assert.equal((await post({ action: "round", id: wager.id }, cookie)).status, 200);
  assert.equal((await post({ action: "round", id: randomUUID() }, cookie)).status, 404);
  assert.equal((await fetch(`${origin}/api/games/admin`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ action: "snapshot" }) })).status, 401);
  await prisma.user.update({ where: { id: user.id }, data: { sessionVersion: 1 } });
  assert.equal((await post({ action: "profile" }, cookie)).status, 401);
  console.log("PASS: local launch, HTTP-only session, mobile catalog, wager, duplicate replay, native balance/ledger, round lookup, revoked session, admin authorization and cross-origin rejection.");
} finally {
  if (user) {
    await prisma.gamePlayerSession.deleteMany({ where: { userId: user.id } });
    await prisma.gameRound.deleteMany({ where: { userId: user.id } });
    await prisma.gameLog.deleteMany({ where: { userId: user.id } });
    await prisma.walletTransaction.deleteMany({ where: { userId: user.id } });
    await prisma.apiRequestLog.deleteMany({ where: { userPublicId: user.publicId } });
    await prisma.user.delete({ where: { id: user.id } });
  }
  await prisma.gameDefinition.deleteMany({ where: { id: gameId } });
  await prisma.$disconnect();
}
