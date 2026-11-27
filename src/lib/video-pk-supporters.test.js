import { expect, it, vi } from "vitest";
vi.mock("./realtime.js", () => ({ emitToVideoLive: vi.fn() }));
vi.mock("./user-perks.js", () => ({ resolveUserPerks: vi.fn(async users => new Map(users.map(u => [u.publicId, { frameUrl: `/f/${u.publicId}.svga`, frameMimeType: "application/svga" }]))) }));
import { pkSideSupporters } from "./video-pk.js";
const t = s => new Date(`2026-11-27T10:${s}:00Z`);
const pk = { startedAt: t("10"), endsAt: t("15"), endedAt: null, leftSession: { id: "L", publicId: "LIVE-L", hostId: "hL" }, rightSession: { id: "R", publicId: "LIVE-R", hostId: "hR" } };
function db(gifts) {
  const users = ["a", "b", "c", "d", "hL", "hR"].map(id => ({ id, publicId: `USR-${id}`, name: `User ${id}`, profileImage: null }));
  return {
    user: { findMany: async ({ where }) => users.filter(u => where.id.in.includes(u.id)) },
    giftTransaction: { groupBy: vi.fn(async ({ where, take }) => {
      const sums = new Map();
      for (const g of gifts) if (g.live === where.liveSessionId && g.to === where.recipientUserId && g.from !== where.senderId.not && !g.reversed && g.at >= where.createdAt.gte && g.at <= where.createdAt.lte) { const r = sums.get(g.from) ?? { senderId: g.from, _sum: { coinValue: 0n }, _max: { createdAt: g.at } }; r._sum.coinValue += g.coins; sums.set(g.from, r); }
      return [...sums.values()].sort((x, y) => Number(y._sum.coinValue - x._sum.coinValue)).slice(0, take);
    }) },
  };
}
const g = (from, live, coins, min = "12", to = live === "L" ? "hL" : "hR") => ({ from, live, to, coins, at: t(min) });
it("ranks supporters per side by coins and returns the app contract", async () => {
  const sides = await pkSideSupporters(db([g("a", "L", 10n), g("b", "L", 50n), g("a", "L", 5n), g("c", "R", 7n)]), pk, "https://x");
  expect(sides).toEqual([
    { liveId: "LIVE-L", supporters: [
      { publicId: "USR-b", name: "User b", profileImage: null, frameUrl: "/f/USR-b.svga", frameMimeType: "application/svga", totalCoins: "50" },
      { publicId: "USR-a", name: "User a", profileImage: null, frameUrl: "/f/USR-a.svga", frameMimeType: "application/svga", totalCoins: "15" } ] },
    { liveId: "LIVE-R", supporters: [{ publicId: "USR-c", name: "User c", profileImage: null, frameUrl: "/f/USR-c.svga", frameMimeType: "application/svga", totalCoins: "7" }] },
  ]);
});
it("counts only gifts inside the PK window to the side host and excludes the host", async () => {
  const sides = await pkSideSupporters(db([g("a", "L", 100n, "05"), g("b", "L", 100n, "20"), g("hL", "L", 100n), g("c", "L", 100n, "12", "guest"), g("d", "L", 3n)]), pk, "");
  expect(sides[0].supporters.map(s => s.publicId)).toEqual(["USR-d"]);
});
it("uses endedAt as window end and limits to top 3 by default", async () => {
  const d = db([g("a", "L", 4n), g("b", "L", 3n), g("c", "L", 2n), g("d", "L", 1n), g("b", "R", 9n, "14")]);
  const sides = await pkSideSupporters(d, { ...pk, endedAt: t("13") }, "");
  expect(sides[0].supporters.map(s => s.totalCoins)).toEqual(["4", "3", "2"]);
  expect(sides[1].supporters).toEqual([]);
  expect(d.giftTransaction.groupBy.mock.calls[0][0]).toMatchObject({ by: ["senderId"], take: 3, where: { liveSessionId: "L", reversedAt: null } });
});
it("returns empty sides before the PK starts", async () => {
  expect(await pkSideSupporters(db([g("a", "L", 4n)]), { ...pk, startedAt: null }, "")).toEqual([{ liveId: "LIVE-L", supporters: [] }, { liveId: "LIVE-R", supporters: [] }]);
});
