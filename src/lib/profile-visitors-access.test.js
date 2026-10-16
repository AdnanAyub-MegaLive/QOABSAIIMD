import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ db: { vipMembership: { findUnique: vi.fn() }, userProfileVisit: { findMany: vi.fn() }, userBlock: { findMany: vi.fn() }, userFollow: { findMany: vi.fn() } }, auth: vi.fn(), access: vi.fn() }));
vi.mock("./prisma.js", () => ({ prisma: mocks.db }));
vi.mock("./mobile-api.js", () => ({ requireMobileUser: mocks.auth, mobileJson: (body, status = 200) => Response.json(body, { status }), mobileApiError: () => Response.json({}, { status: 401 }) }));
vi.mock("./public-profile.js", () => ({ profileAccess: mocks.access, equippedProfileAssets: async () => new Map(), publicPerson: {}, activePerson: {}, wallOffset: () => 0, wallCursor: () => "next" }));
vi.mock("./user-perks.js", () => ({ requestOrigin: () => "https://portal.example" }));
vi.mock("./avatar-history.js", () => ({ avatarDisplayUrl: x => x }));
import { profileSocialList } from "./profile-social-api.js";
const membership = () => ({ startsAt: new Date(Date.now() - 10000), expiresAt: new Date(Date.now() + 60000), tier: { active: true, level: 3, privileges: ["VIEW_VISITORS"] } });
const get = (query = "", type = "visitors") => profileSocialList(new Request(`https://portal.example/api/v1/users/USR-1/visitors${query}`), Promise.resolve({ publicId: "USR-1" }), type);
beforeEach(() => {
  vi.clearAllMocks(); mocks.auth.mockResolvedValue({ id: "u", vipLevel: 999 }); mocks.access.mockResolvedValue({ target: { id: "u" }, isSelf: true });
  mocks.db.vipMembership.findUnique.mockResolvedValue(membership()); mocks.db.userProfileVisit.findMany.mockResolvedValue([]); mocks.db.userBlock.findMany.mockResolvedValue([]); mocks.db.userFollow.findMany.mockResolvedValue([]);
});
it("allows the owner's active enabled VIP 3 and higher", async () => {
  expect((await get()).status).toBe(200);
  mocks.db.vipMembership.findUnique.mockResolvedValue({ ...membership(), tier: { ...membership().tier, level: 10 } });
  expect((await get()).status).toBe(200);
});
it("rejects another person's visitors before querying membership or records", async () => {
  mocks.access.mockResolvedValue({ target: { id: "other" }, isSelf: false }); expect((await get()).status).toBe(403);
  expect(mocks.db.vipMembership.findUnique).not.toHaveBeenCalled(); expect(mocks.db.userProfileVisit.findMany).not.toHaveBeenCalled();
});
it.each([null, { ...membership(), expiresAt: new Date(0) }, { ...membership(), revokedAt: new Date() }, { ...membership(), startsAt: new Date(Date.now() + 86400000) }, { ...membership(), tier: { ...membership().tier, active: false } }])("denies inactive memberships without leaking visitor data", async row => {
  mocks.db.vipMembership.findUnique.mockResolvedValue(row); const response = await get("?cursor=anything"); expect(response.status).toBe(403);
  expect((await response.json()).error).toEqual({ code: "VIP_3_REQUIRED", message: "Buy VIP 3 to view visitor details." }); expect(mocks.db.userProfileVisit.findMany).not.toHaveBeenCalled();
});
it.each([{ ...membership().tier, level: 2 }, { ...membership().tier, privileges: [] }])("denies insufficient or disabled privileges on every page", async tier => {
  mocks.db.vipMembership.findUnique.mockResolvedValue({ ...membership(), tier });
  const response = await get("?cursor=anything"); expect(response.status).toBe(403); expect((await response.json()).error.code).toBe("VIP_3_REQUIRED"); expect(mocks.db.userProfileVisit.findMany).not.toHaveBeenCalled();
});
it("does not change followers or following access", async () => {
  mocks.db.vipMembership.findUnique.mockResolvedValue(null); expect((await get("", "followers")).status).toBe(200); expect((await get("", "following")).status).toBe(200); expect(mocks.db.vipMembership.findUnique).not.toHaveBeenCalled();
});
it("requires authentication before accessing records", async () => {
  mocks.auth.mockRejectedValue(Error("INVALID_SESSION")); expect((await get()).status).toBe(401); expect(mocks.db.userProfileVisit.findMany).not.toHaveBeenCalled();
});
