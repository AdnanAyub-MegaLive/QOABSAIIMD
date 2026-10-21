import { expect, it, vi } from "vitest";
import { activeSearchSpecialId, searchUsers } from "./user-search.js";

const now = new Date("2026-10-21T12:00:00Z");
const row = (id, names) => ({ id, publicId: `USR-${id}`, name: id, specialIds: names.map(specialId => ({ specialId })) });
it.each(["PHOJI", "pho", "phoji", "OZ069", "oz069"])("matches %s case-insensitively with all active-assignment constraints", async query => {
  const findMany = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([row("holder", ["PHOJI"])]);
  await searchUsers({ user: { findMany } }, "caller", query, now);
  const active = { status: "ACTIVE", revokedAt: null, startsAt: { lte: now }, expiresAt: { gt: now } };
  expect(findMany.mock.calls[0][0].where.specialIds.some).toEqual({ ...active, specialId: { equals: query, mode: "insensitive" } });
  expect(findMany.mock.calls[1][0].where.OR[2]).toEqual({ specialIds: { some: { ...active, specialId: { contains: query, mode: "insensitive" } } } });
  for (const [args] of findMany.mock.calls) {
    expect(args.where).toMatchObject({ deletedAt: null, status: "ACTIVE", id: { not: "caller" }, bans: { none: { target: "USER", revokedAt: null } } });
    expect(args.select.specialIds.where).toEqual(active);
  }
});
it("places exact Special ID matches first before filling the remaining slots", async () => {
  const findMany = vi.fn().mockResolvedValueOnce([row("Zed", ["NEWER", "PHOJI"])]).mockResolvedValueOnce([row("Aaron", ["PHOJI-2"])]);
  const results = await searchUsers({ user: { findMany } }, "caller", "phoji", now);
  expect(results.map(u => u.specialId)).toEqual(["PHOJI", "PHOJI-2"]);
  expect(results[0]).not.toHaveProperty("specialIds");
  expect(findMany.mock.calls[1][0].take).toBe(19);
  expect(findMany.mock.calls[1][0].where.id.notIn).toEqual(["Zed"]);
});
it("returns at most 20 users even when exact matches fill the limit", async () => {
  const findMany = vi.fn(async () => Array.from({ length: 20 }, (_, n) => row(String(n), ["MATCH"])));
  expect(await searchUsers({ user: { findMany } }, "caller", "match", now)).toHaveLength(20);
  expect(findMany).toHaveBeenCalledTimes(1);
});
it("returns null for ordinary name/public-ID results with no active Special ID", async () => {
  const findMany = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([row("Name", [])]);
  expect((await searchUsers({ user: { findMany } }, "caller", "Name", now))[0].specialId).toBeNull();
});
it.each([
  { status: "EXPIRED" }, { revokedAt: new Date("2026-10-20") },
  { startsAt: new Date("2026-10-22") }, { expiresAt: now },
  { expiresAt: new Date("2026-10-20") }, { expiresAt: null },
])("active predicate excludes %j (including exact expiry boundary)", change => {
  const a = { status: "ACTIVE", revokedAt: null, startsAt: new Date("2026-10-20"), expiresAt: new Date("2026-10-22"), ...change };
  const w = activeSearchSpecialId(now);
  expect(a.status === w.status && a.revokedAt === w.revokedAt && a.startsAt <= w.startsAt.lte && a.expiresAt !== null && a.expiresAt > w.expiresAt.gt).toBe(false);
});
