import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("./prisma.js", () => ({ prisma: {} }));
import { equippedProfileAssets } from "./public-profile.js";
import { namedDecoration, perkMediaFields } from "./decoration-media.js";
import { refreshActivityEventMedia } from "./activity-event-media.js";

afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
const asset = { publicId: "AST-test", mimeType: "application/svga", mediaVersion: "0123456789abcdef", posterMimeType: "image/webp", posterMediaVersion: "fedcba9876543210", active: true };
describe("equipped animated media", () => {
  it.each([["FRAMES", "avatarFrame"], ["BADGES", "profileBadge"], ["PROFILE_DRESS", "profileDress"], ["USER_TAGS", "userTag"], ["PROFILE_BG", "profileBackground"]])("returns %s with independently versioned poster", async (category, key) => {
    vi.stubEnv("AUTH_SECRET", "test-only-secret");
    const db = { userEquippedProp: { findMany: vi.fn().mockResolvedValue([{ userId: "u", category, asset: { ...asset, category, isGlobal: false, assignments: [{ userId: "u" }] } }]) }, uploadAsset: { findMany: vi.fn().mockResolvedValue([{ ...asset, category }]) } };
    const media = (await equippedProfileAssets([{ id: "u" }], "https://portal.example", db)).get("u")[key];
    expect(media.mimeType).toBe("application/svga");
    expect(new URL(media.url).searchParams.get("v")).toBe(asset.mediaVersion);
    expect(new URL(media.posterUrl).searchParams.get("v")).toBe(asset.posterMediaVersion);
    expect(new URL(media.url).searchParams.has("displaySig")).toBe(true);
    const fields = namedDecoration("frame", media);
    expect(perkMediaFields({ ...fields, wallet: "private" })).toMatchObject({ frameMimeType: "application/svga", framePosterMimeType: "image/webp" });
    expect(perkMediaFields({ wallet: "private" })).toEqual({});
    db.userEquippedProp.findMany.mockResolvedValue([{ userId: "u", category, asset: { ...asset, category, isGlobal: false, assignments: [] } }]);
    expect((await equippedProfileAssets([{ id: "u" }], "https://portal.example", db)).get("u")[key]).toBeNull();
  });
});
describe("activity badge delivery", () => {
  it("resolves the committed badge and preserves event revision", async () => {
    vi.stubEnv("AUTH_SECRET", "test-only-secret");
    vi.stubEnv("MOBILE_API_BASE_URL", "https://portal.example");
    const db = { uploadAsset: { findUnique: vi.fn().mockResolvedValue(asset) } };
    const payload = { success: true, data: { badgeAssetId: asset.publicId, revision: 2, level: 3, badgeUrl: null } };
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-15T00:00:00Z"));
    const result = await refreshActivityEventMedia(payload, db);
    expect(result.data).toMatchObject({ revision: 2, level: 3, badgeMimeType: "application/svga" });
    expect(new URL(result.data.badgeUrl).searchParams.get("v")).toBe(asset.mediaVersion);
    expect(db.uploadAsset.findUnique.mock.calls[0][0].where).toEqual({ publicId: asset.publicId });
    vi.setSystemTime(new Date("2026-10-16T00:00:00Z"));
    const retry = await refreshActivityEventMedia(result, db);
    expect(new URL(retry.data.badgeUrl).searchParams.get("displayExp")).not.toBe(new URL(result.data.badgeUrl).searchParams.get("displayExp"));
    expect(retry.data.revision).toBe(2);
    db.uploadAsset.findUnique.mockResolvedValue({ ...asset, active: false });
    expect((await refreshActivityEventMedia(payload, db)).data.badgeUrl).toBeNull();
  });
  it("does not silently deliver a configured badge without a trusted origin", async () => {
    vi.stubEnv("MOBILE_API_BASE_URL", ""); vi.stubEnv("AUTH_URL", "");
    await expect(refreshActivityEventMedia({ data: { badgeAssetId: "AST-test" } }, {})).rejects.toThrow("Configure MOBILE_API_BASE_URL");
  });
});
