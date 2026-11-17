import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ db: {}, emit: vi.fn(), participants: new Set() }));
vi.mock("server-only", () => ({}));
vi.mock("./prisma.js", () => ({ prisma: mocks.db }));
vi.mock("./realtime.js", () => ({ emitToAudioRoom: mocks.emit, audioRoomParticipantIds: async () => new Set(mocks.participants) }));
vi.mock("./wallet.js", () => ({ ledgerData: (data) => data, walletPublicId: () => "RED-NEW" }));

import { giftLeaveGraceEnabled, lateGiftSender, markAudioRoomRemoved, recordAudioRoomJoin, recordAudioRoomLeave, resetGiftLeaveGrace, startRedEnvelopeRefundSweeper, tappedWhilePresent } from "./gift-leave-grace.js";
import { expireRedEnvelopes } from "./red-envelope-expiry.js";
import { createRedEnvelope } from "./red-envelopes.js";
import { parseRedEnvelopeInput } from "./red-envelope-contract.js";

beforeEach(() => { resetGiftLeaveGrace(); mocks.emit.mockClear(); });

describe("presence window", () => {
  const now = 1_000_000_000;
  it("accepts a tap made between join and leave within 120 s", () => {
    recordAudioRoomJoin("U", "audio-room:R", now - 60_000);
    recordAudioRoomLeave("U", "audio-room:R", now - 30_000);
    expect(tappedWhilePresent("U", "R", new Date(now - 40_000).toISOString(), now)).toBe(true);
    expect(tappedWhilePresent("U", "R", new Date(now - 90_000).toISOString(), now)).toBe(false);
    expect(tappedWhilePresent("U", "R", undefined, now)).toBe(false);
    expect(tappedWhilePresent("U", "OTHER", new Date(now - 40_000).toISOString(), now)).toBe(false);
    expect(tappedWhilePresent("U", "R", new Date(now + 60_000).toISOString(), now)).toBe(false);
    expect(tappedWhilePresent("U", "R", new Date(now - 40_000).toISOString(), now + 100_000)).toBe(false);
  });
  it("ignores non audio-room channels and still-open sessions", () => {
    recordAudioRoomJoin("U", "user:U", now - 60_000);
    recordAudioRoomJoin("U", "audio-room:R", now - 60_000);
    expect(tappedWhilePresent("U", "R", new Date(now - 10_000).toISOString(), now)).toBe(false);
  });
  it("ignores sessions ended by removal but keeps normal leaves", () => {
    recordAudioRoomJoin("U", "audio-room:R", now - 60_000);
    markAudioRoomRemoved("U", "R");
    recordAudioRoomLeave("U", "audio-room:R", now - 30_000);
    expect(tappedWhilePresent("U", "R", new Date(now - 40_000).toISOString(), now)).toBe(false);
    recordAudioRoomJoin("V", "audio-room:R", now - 60_000);
    recordAudioRoomLeave("V", "audio-room:R", now - 30_000);
    expect(tappedWhilePresent("V", "R", new Date(now - 40_000).toISOString(), now)).toBe(true);
  });
  it("is off unless the settings row enables it, and fails closed", async () => {
    expect(await giftLeaveGraceEnabled({ giftLeaveGraceSettings: { findUnique: async () => null } })).toBe(false);
    resetGiftLeaveGrace();
    expect(await giftLeaveGraceEnabled({ giftLeaveGraceSettings: { findUnique: async () => { throw new Error("missing table"); } } })).toBe(false);
    resetGiftLeaveGrace();
    expect(await giftLeaveGraceEnabled({ giftLeaveGraceSettings: { findUnique: async () => ({ enabled: true }) } })).toBe(true);
  });
  it("never consults settings for a present sender or a missing tappedAt", async () => {
    const db = { giftLeaveGraceSettings: { findUnique: vi.fn(async () => ({ enabled: true })) } };
    expect(await lateGiftSender(db, { senderId: "U", roomId: "R", tappedAt: "x", participants: new Set(["U"]) })).toBe(false);
    expect(await lateGiftSender(db, { senderId: "U", roomId: "R", participants: new Set() })).toBe(false);
    expect(db.giftLeaveGraceSettings.findUnique).not.toHaveBeenCalled();
  });
});

describe("red envelope refund sweeper", () => {
  it("does nothing while the switch is off", async () => {
    const expire = vi.fn();
    const { timer, run } = startRedEnvelopeRefundSweeper({ giftLeaveGraceSettings: { findUnique: async () => ({ enabled: false }) } }, expire);
    clearInterval(timer);
    expect(await run()).toBe(false);
    expect(expire).not.toHaveBeenCalled();
  });
  it("sweeps all rooms and never overlaps", async () => {
    let release;
    const expire = vi.fn(() => new Promise((resolve) => { release = resolve; }));
    const { timer, run } = startRedEnvelopeRefundSweeper({ giftLeaveGraceSettings: { findUnique: async () => ({ enabled: true }) } }, expire);
    clearInterval(timer);
    const first = run();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(await run()).toBe(false);
    release();
    expect(await first).toBe(true);
    expect(expire).toHaveBeenCalledOnce();
    expect(expire.mock.calls[0][0]).toBeNull();
  });
  it("refunds an expired envelope in an empty room", async () => {
    const updates = [], ledger = [];
    Object.assign(mocks.db, {
      redEnvelope: {
        findMany: vi.fn(async () => [{ id: "RED-1", senderId: "sender", remainingCoins: 40n, audioRoom: { roomId: "ROOM-EMPTY" } }]),
        updateMany: async () => ({ count: 1 }),
      },
      user: { update: async (args) => { updates.push(args); return {}; } },
      walletTransaction: { create: async ({ data }) => { ledger.push(data); return data; } },
      $transaction: async (fn) => fn(mocks.db),
    });
    mocks.participants = new Set();
    await expireRedEnvelopes(null, new Date());
    expect(mocks.db.redEnvelope.findMany.mock.calls[0][0].where).not.toHaveProperty("audioRoom");
    expect(updates).toEqual([{ where: { id: "sender" }, data: { coinBalance: { increment: 40n } } }]);
    expect(ledger.map((row) => row.type)).toEqual(["RED_ENVELOPE_REFUND"]);
  });
});

describe("red envelope send requestId", () => {
  const user = { id: "sender", publicId: "USR-S" };
  const stored = new Map();
  beforeEach(() => {
    stored.clear();
    mocks.participants = new Set(["USR-S"]);
    Object.assign(mocks.db, {
      redEnvelopeSettings: { upsert: async () => ({ enabled: true, maxCoins: 1000n, roomCardMinCoins: 0n, maxShareCount: 10, maxDelaySeconds: 60, claimWindowSeconds: 600, updatedAt: new Date() }) },
      redEnvelopePreset: { findMany: async () => [] },
      audioRoom: { findFirst: async () => ({ id: "room", roomId: "ROOM-1" }) },
      redEnvelope: {
        findMany: async () => [],
        findUnique: vi.fn(async ({ where }) => stored.get(where.senderId_requestId?.requestId) ?? null),
        create: vi.fn(async ({ data }) => {
          const row = { ...data, status: "ACTIVE", createdAt: new Date(), audioRoom: { roomId: "ROOM-1" }, sender: { publicId: "USR-S", name: "S" }, claims: [] };
          if (data.requestId) stored.set(data.requestId, row);
          return row;
        }),
      },
      user: { updateMany: vi.fn(async () => ({ count: 1 })) },
      walletTransaction: { create: async ({ data }) => data },
      $transaction: async (fn) => fn(mocks.db),
    });
  });
  it("parses requestId only when sent", () => {
    expect(parseRedEnvelopeInput({ roomId: "R", totalCoins: "10", shareCount: 2, delaySeconds: 0 })).not.toHaveProperty("requestId");
    expect(parseRedEnvelopeInput({ roomId: "R", totalCoins: "10", shareCount: 2, delaySeconds: 0, requestId: "bag-0001" }).requestId).toBe("bag-0001");
    expect(() => parseRedEnvelopeInput({ roomId: "R", totalCoins: "10", shareCount: 2, delaySeconds: 0, requestId: "x" })).toThrow();
  });
  it("returns the original envelope for a repeated requestId and charges once", async () => {
    const input = parseRedEnvelopeInput({ roomId: "ROOM-1", totalCoins: "100", shareCount: 5, delaySeconds: 0, requestId: "bag-retry-01" });
    const first = await createRedEnvelope(user, input);
    mocks.participants = new Set();
    const second = await createRedEnvelope(user, input);
    expect(second).toEqual(first);
    expect(mocks.db.user.updateMany).toHaveBeenCalledOnce();
    expect(mocks.db.redEnvelope.create).toHaveBeenCalledOnce();
    expect(mocks.emit.mock.calls.filter((call) => call[2]?.data?.action === "CREATED")).toHaveLength(1);
  });
  it("creates a new envelope each time without requestId", async () => {
    const input = parseRedEnvelopeInput({ roomId: "ROOM-1", totalCoins: "100", shareCount: 5, delaySeconds: 0 });
    await createRedEnvelope(user, input);
    await createRedEnvelope(user, input);
    expect(mocks.db.user.updateMany).toHaveBeenCalledTimes(2);
    expect(mocks.db.redEnvelope.findUnique).not.toHaveBeenCalled();
    expect(mocks.db.redEnvelope.create.mock.calls[0][0].data).not.toHaveProperty("requestId");
  });
});
