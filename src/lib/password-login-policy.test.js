import { beforeEach, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { consumeAuthAttempts, identifierBucket, loginIdentifier, resolvePasswordLoginUser } from "./password-login-policy.js";
let db;
beforeEach(() => { db = { specialIdAssignment: { findFirst: vi.fn(async () => null) }, user: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []), findUnique: vi.fn(async () => null) } }; });
it("uses identifier when both fields are sent and preserves phone-only clients", () => {
  expect(loginIdentifier({ identifier: " 2030146 ", phone: "other" })).toBe("2030146");
  expect(loginIdentifier({ phone: "+92 300-1234567" })).toBe("+92 300-1234567");
  expect(identifierBucket("usr-2030146")).toBe(identifierBucket("2030146"));
  expect(identifierBucket("+92 300-1234567")).toBe("+923001234567");
});
it("gives exact active special IDs precedence, including validity boundaries", async () => {
  db.specialIdAssignment.findFirst.mockResolvedValue({ user: { id: "special" } });
  const now = new Date();
  expect(await resolvePasswordLoginUser(db, "Star1", now)).toEqual({ id: "special" });
  expect(db.specialIdAssignment.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: {
    specialId: { equals: "Star1", mode: "insensitive" }, status: "ACTIVE", revokedAt: null, startsAt: { lte: now }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  } }));
  expect(db.user.findFirst).not.toHaveBeenCalled();
});
it.each(["2030146", "USR-2030146", "TLN-2030146"])("resolves numeric normal ID aliases %s", async value => {
  db.user.findMany.mockResolvedValue([{ id: "normal" }]);
  expect(await resolvePasswordLoginUser(db, value)).toEqual({ id: "normal" });
  expect(db.user.findMany).toHaveBeenCalledWith({ where: { publicId: { in: ["2030146", "USR-2030146", "TLN-2030146"] } }, take: 2 });
});
it("prefers an exact public ID and refuses ambiguous numeric aliases", async () => {
  db.user.findFirst.mockResolvedValueOnce({ id: "exact" });
  expect(await resolvePasswordLoginUser(db, "usr-2030146")).toEqual({ id: "exact" });
  db.user.findMany.mockResolvedValue([{ id: "a" }, { id: "b" }]);
  expect(await resolvePasswordLoginUser(db, "2030146")).toBeNull();
  expect(db.user.findUnique).not.toHaveBeenCalled();
});
it("falls back to normalized phone and rejects empty or overlong IDs", async () => {
  db.user.findUnique.mockResolvedValue({ id: "phone" });
  expect(await resolvePasswordLoginUser(db, "+92 (300) 123-4567")).toEqual({ id: "phone" });
  expect(db.user.findUnique).toHaveBeenCalledWith({ where: { phone: "+923001234567" } });
  expect(await resolvePasswordLoginUser(db, "")).toBeNull();
  expect(await resolvePasswordLoginUser(db, "x".repeat(256))).toBeNull();
});
it("shares atomic limits across callers, hashes keys and expires windows", async () => {
  const pg = new PGlite();
  const sql = (strings, values) => strings.reduce((text, part, i) => text + part + (i < values.length ? `$${i + 1}` : ""), "");
  const client = { $queryRaw: async (s, ...v) => (await pg.query(sql(s, v), v)).rows, $executeRaw: async (s, ...v) => pg.query(sql(s, v), v) };
  try {
    await pg.exec(readFileSync('prisma/migrations/20261112120000_auth_attempt_buckets/migration.sql', 'utf8'));
    const results = await Promise.allSettled(Array.from({ length: 12 }, () => consumeAuthAttempts(client, ["identifier:secret", "ip:shared"], 10, 900)));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(10);
    expect(results.filter(r => r.status === "rejected").every(r => r.reason.status === 429)).toBe(true);
    await expect(consumeAuthAttempts(client, ["identifier:new", "ip:shared"], 10, 900)).rejects.toMatchObject({ code: "RATE_LIMITED", retryAfter: 900 });
    const rows = (await pg.query('SELECT * FROM "AuthAttemptBucket"')).rows;
    expect(rows.every(r => /^[a-f0-9]{64}$/.test(r.key))).toBe(true);
    await pg.exec('UPDATE "AuthAttemptBucket" SET "expiresAt" = now() - interval \'1 second\'');
    await consumeAuthAttempts(client, ["ip:shared"], 10, 900);
    expect((await pg.query('SELECT attempts FROM "AuthAttemptBucket"')).rows).toEqual([{ attempts: 1 }]);
  } finally { await pg.close(); }
}, 30000);
