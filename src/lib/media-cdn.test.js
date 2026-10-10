import { describe, it, expect, vi, afterEach } from "vitest";
import { canPublishMedia, publicCdnUrl } from "./media-cdn-policy.js";
import { spacesConfig, mediaKey, publishMedia, mirrorAssetBestEffort } from "./media-cdn.js";
const asset = { id: "internal", publicId: "AST-123", category: "GIFTS", mimeType: "image/png", isGlobal: true, active: true, fileData: Buffer.from("fixture"), updatedAt: new Date() };
const config = { endpoint: "https://sgp1.digitaloceanspaces.com", base: "https://media.megachat.live", bucket: "megalive-space", credentials: { accessKeyId: "test", secretAccessKey: "test" } };
afterEach(() => vi.unstubAllEnvs());
describe("public artwork CDN", () => {
  it("excludes private assignments, private music, KYC, inactive and unsupported formats", () => {
    expect(canPublishMedia(asset)).toBe(true);
    for (const change of [{ isGlobal: false }, { category: "MUSIC_TRACKS" }, { category: "KYC" }, { audioRoomId: "room" }, { active: false }, { mimeType: "image/svg+xml" }, { category: "AVATARS" }]) expect(canPublishMedia({ ...asset, ...change })).toBe(false);
  });
  it("uses content-versioned keys with safe extensions and no user filenames", () => {
    const first = mediaKey(asset.publicId, asset.fileData, asset.mimeType);
    expect(first).toMatch(/^portal-media\/AST-123\/[a-f0-9]{64}\.png$/);
    expect(mediaKey(asset.publicId, Buffer.from("new"), asset.mimeType)).not.toBe(first);
    expect(() => mediaKey("../escape", asset.fileData, asset.mimeType)).toThrow();
  });
  it("fails closed for incomplete configuration", () => {
    expect(spacesConfig({})).toBeNull();
    expect(() => spacesConfig({ MEDIA_CDN_ENABLED: "true" })).toThrow();
  });
  it("uploads public bytes and poster with MIME and cache metadata", async () => {
    const client = { send: vi.fn().mockResolvedValue({}) };
    const result = await publishMedia({ ...asset, posterFileData: Buffer.from("poster"), posterMimeType: "image/webp" }, { config, client });
    expect(client.send).toHaveBeenCalledTimes(2);
    expect(client.send.mock.calls[0][0].input).toMatchObject({ ACL: "public-read", ContentType: "image/png", CacheControl: "public, max-age=86400, immutable" });
    expect(result.cdnUrl).toContain("https://media.megachat.live/portal-media/");
    expect(result.posterCdnUrl).toContain("poster-");
  });
  it("never uploads private media", async () => {
    const client = { send: vi.fn() };
    expect(await publishMedia({ ...asset, category: "MUSIC_TRACKS" }, { config, client })).toBeNull();
    expect(client.send).not.toHaveBeenCalled();
  });
  it("rejects external redirect origins and respects the rollout switch", () => {
    vi.stubEnv("MEDIA_CDN_ENABLED", "true"); vi.stubEnv("MEDIA_CDN_BASE_URL", config.base);
    expect(publicCdnUrl({ ...asset, cdnUrl: "https://evil.example/portal-media/x" })).toBeNull();
    const cdnUrl = `${config.base}/portal-media/x.png`;
    expect(publicCdnUrl({ ...asset, cdnUrl })).toBe(cdnUrl);
    vi.stubEnv("MEDIA_CDN_ENABLED", "false");
    expect(publicCdnUrl({ ...asset, cdnUrl })).toBeNull();
  });
  it("preserves database media when mirroring cannot be configured", async () => {
    vi.stubEnv("MEDIA_CDN_ENABLED", "true"); vi.stubEnv("SPACES_ACCESS_KEY_ID", "");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await mirrorAssetBestEffort({}, asset)).toBe(asset);
    log.mockRestore();
  });
});
