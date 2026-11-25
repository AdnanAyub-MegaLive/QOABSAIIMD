import { beforeEach, describe, expect, it, vi } from "vitest";
import { crc32, deflateSync } from "node:zlib";
import sharp from "sharp";
import { Readable } from "node:stream";
import { createPartnerHandlers } from "./partner-api-handlers.js";
import { clearPartnerKeyCache } from "./partner-auth.js";
import { clearPartnerCatalogCache, decodeCursor, encodeCursor, mallItemWhere } from "./partner-catalog.js";
import { createPartnerKey, hashPartnerKey } from "./partner-keys.js";
import { createPartnerMediaUrl, partnerMediaExpiry, verifyPartnerMediaSignature } from "./partner-media-sign.js";
import { buildPreview, ensurePreview, extractSvgaImage, readCapped, resetFfmpegState, resetPreviewJobs } from "./partner-previews.js";

process.env.PARTNER_MEDIA_SECRET = "test-partner-secret";
let seq = 0;
const at = (n) => new Date(Date.UTC(2026, 0, 1, 0, 0, n));
const asset = (n, extra = {}) => ({ id: `a${n}`, publicId: `AST-${String(n).padStart(3, "0")}`, name: `Item ${n}`, mimeType: "image/png", mediaVersion: `v${n}`, posterMediaVersion: null, updatedAt: at(n), ...extra });

function setup({ assets = [], key: keyOverride = {}, removals = [] } = {}) {
  seq += 1;
  const raw = `mpk_test_${seq}`;
  const key = { id: `key${seq}`, publicId: `PK-${seq}`, name: "Store", active: true, revokedAt: null, allowedOrigins: [], keyHash: hashPartnerKey(raw), ...keyOverride };
  const matches = (row, where) => {
    if (!where) return true;
    if (where.AND) return where.AND.every((w) => matches(row, w));
    if (where.OR) return where.OR.some((w) => matches(row, w));
    return Object.entries(where).every(([field, cond]) => {
      const value = row[field];
      if (cond && typeof cond === "object" && !(cond instanceof Date)) {
        if ("in" in cond) return cond.in.includes(value);
        if ("not" in cond) return value !== cond.not;
        if ("gt" in cond) return value instanceof Date ? value > cond.gt : value > cond.gt;
        if ("gte" in cond) return value >= cond.gte;
        return true;
      }
      if (cond instanceof Date) return value?.getTime() === cond.getTime();
      return value === cond;
    });
  };
  const rows = assets.map((a) => ({ active: true, archivedAt: null, storeVisible: true, category: "FRAMES", ...a }));
  const db = {
    partnerApiKey: {
      findUnique: vi.fn(async ({ where }) => (where.keyHash === key.keyHash || where.publicId === key.publicId ? key : null)),
      update: vi.fn(async () => key),
    },
    uploadAsset: {
      findMany: vi.fn(async ({ where, take }) => rows.filter((r) => matches(r, where)).sort((a, b) => a.updatedAt - b.updatedAt || a.publicId.localeCompare(b.publicId)).slice(0, take)),
      findFirst: vi.fn(async ({ where }) => rows.find((r) => matches(r, where)) ?? null),
      findUnique: vi.fn(async ({ where }) => rows.find((r) => r.id === where.id) ?? null),
    },
    partnerCatalogRemoval: { findMany: vi.fn(async ({ where, take }) => removals.filter((r) => matches(r, where)).sort((a, b) => a.removedAt - b.removedAt || a.id.localeCompare(b.id)).slice(0, take)) },
    assetPreview: { findUnique: vi.fn(async () => null), upsert: vi.fn(async ({ create }) => ({ id: "p1", ...create })) },
  };
  return { db, raw, key, handlers: createPartnerHandlers(db) };
}
const req = (path, headers = {}) => new Request(`https://portal.test${path}`, { headers: { "x-forwarded-for": `10.0.${Math.floor(seq / 250)}.${seq % 250}`, ...headers } });

beforeEach(() => { clearPartnerKeyCache(); clearPartnerCatalogCache(); resetPreviewJobs(); });

describe("partner auth", () => {
  it("rejects missing, invalid and revoked keys with 401", async () => {
    const { handlers, raw } = setup();
    expect((await handlers.listItems(req("/api/partner/v1/items"))).status).toBe(401);
    expect((await handlers.listItems(req("/api/partner/v1/items", { "x-partner-key": "mpk_wrong" }))).status).toBe(401);
    const revoked = setup({ key: { revokedAt: new Date(), active: false } });
    expect((await revoked.handlers.listItems(req("/api/partner/v1/items", { "x-partner-key": revoked.raw }))).status).toBe(401);
    expect((await handlers.listItems(req("/api/partner/v1/items", { "x-partner-key": raw }))).status).toBe(200);
  });
  it("rate limits at 60 requests per minute per key", async () => {
    const { handlers, raw } = setup();
    for (let i = 0; i < 60; i += 1) expect((await handlers.listItems(req("/api/partner/v1/items", { "x-partner-key": raw }))).status).toBe(200);
    const blocked = await handlers.listItems(req("/api/partner/v1/items", { "x-partner-key": raw }));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBe("60");
  });
  it("throttles lastUsedAt writes", async () => {
    const { handlers, raw, db } = setup();
    for (let i = 0; i < 5; i += 1) await handlers.listItems(req("/api/partner/v1/items", { "x-partner-key": raw }));
    expect(db.partnerApiKey.update).toHaveBeenCalledTimes(1);
  });
  it("stores only the key hash", async () => {
    const tx = { partnerApiKey: { create: vi.fn(async ({ data }) => ({ ...data, active: true, createdAt: new Date() })) }, auditLog: { create: vi.fn() } };
    const db = { $transaction: (fn) => fn(tx) };
    const { rawKey, key } = await createPartnerKey(db, { id: "admin1" }, { name: "Store", allowedOrigins: ["https://shop.example.com/path"] });
    const stored = tx.partnerApiKey.create.mock.calls[0][0].data;
    expect(JSON.stringify(stored)).not.toContain(rawKey);
    expect(stored.keyHash).toBe(hashPartnerKey(rawKey));
    expect(stored.allowedOrigins).toEqual(["https://shop.example.com"]);
    expect(key).not.toHaveProperty("keyHash");
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
  });
});

describe("items", () => {
  const many = Array.from({ length: 60 }, (_, i) => asset(i + 1));
  it("pages with a stable cursor and caps limit at 50", async () => {
    const { handlers, raw } = setup({ assets: many });
    const first = await (await handlers.listItems(req("/api/partner/v1/items?limit=500", { "x-partner-key": raw }))).json();
    expect(first.data.items).toHaveLength(50);
    expect(decodeCursor(first.data.nextCursor)).toEqual({ updatedAt: at(50), publicId: "AST-050" });
    const second = await (await handlers.listItems(req(`/api/partner/v1/items?limit=20&cursor=${first.data.nextCursor}`, { "x-partner-key": raw }))).json();
    expect(second.data.items.map((i) => i.id)).toEqual(many.slice(50).map((a) => a.publicId));
    expect(second.data.nextCursor).toBeNull();
    const def = await (await handlers.listItems(req("/api/partner/v1/items", { "x-partner-key": raw }))).json();
    expect(def.data.items).toHaveLength(20);
  });
  it("filters by updatedSince and rejects bad input", async () => {
    const { handlers, raw } = setup({ assets: many });
    const body = await (await handlers.listItems(req(`/api/partner/v1/items?updatedSince=${at(58).toISOString()}`, { "x-partner-key": raw }))).json();
    expect(body.data.items.map((i) => i.id)).toEqual(["AST-058", "AST-059", "AST-060"]);
    expect((await handlers.listItems(req("/api/partner/v1/items?updatedSince=nope", { "x-partner-key": raw }))).status).toBe(400);
    expect((await handlers.listItems(req("/api/partner/v1/items?cursor=@@", { "x-partner-key": raw }))).status).toBe(400);
    expect((await handlers.listItems(req("/api/partner/v1/items?limit=0", { "x-partner-key": raw }))).status).toBe(400);
  });
  it("returns only Mall items with exactly id, name and media", async () => {
    const assets = [asset(1), asset(2, { storeVisible: false }), asset(3, { archivedAt: new Date() }), asset(4, { active: false }), asset(5, { category: "BANNERS" }), asset(6, { mimeType: "video/mp4" }), asset(7, { mimeType: "application/svga" })];
    const { handlers, raw, db } = setup({ assets });
    const body = await (await handlers.listItems(req("/api/partner/v1/items", { "x-partner-key": raw }))).json();
    expect(db.uploadAsset.findMany.mock.calls[0][0].where.AND[0]).toEqual(mallItemWhere);
    expect(db.uploadAsset.findMany.mock.calls[0][0].select).not.toHaveProperty("fileData");
    expect(body.data.items.map((i) => i.id)).toEqual(["AST-001", "AST-006", "AST-007"]);
    for (const item of body.data.items) {
      expect(Object.keys(item).sort()).toEqual(["id", "media", "name"]);
      expect(item.media.image).toMatch(/\/api\/partner\/v1\/media\/AST-\d+\/image\?/);
      expect(item.media.image).not.toMatch(/uploads|portal-media/);
    }
    expect(Object.keys(body.data.items[0].media)).toEqual(["image"]);
    expect(Object.keys(body.data.items[1].media)).toEqual(["image", "motion"]);
    expect(Object.keys(body.data.items[2].media)).toEqual(["image"]);
  });
  it("supports ETag and 304", async () => {
    const { handlers, raw } = setup({ assets: [asset(1)] });
    const first = await handlers.listItems(req("/api/partner/v1/items", { "x-partner-key": raw }));
    const etag = first.headers.get("etag");
    expect(etag).toBeTruthy();
    const second = await handlers.listItems(req("/api/partner/v1/items", { "x-partner-key": raw, "if-none-match": etag }));
    expect(second.status).toBe(304);
    expect(await second.text()).toBe("");
    const one = await handlers.getItem(req("/api/partner/v1/items/AST-001", { "x-partner-key": raw }), "AST-001");
    expect(Object.keys((await one.json()).data).sort()).toEqual(["id", "media", "name"]);
    expect((await handlers.getItem(req("/api/partner/v1/items/AST-404", { "x-partner-key": raw }), "AST-404")).status).toBe(404);
  });
  it("encodes cursors opaquely", () => {
    const c = encodeCursor(asset(3));
    expect(c).not.toContain("AST");
    expect(decodeCursor(c).publicId).toBe("AST-003");
  });
});

describe("signed media", () => {
  const parts = (url) => { const u = new URL(url); return Object.fromEntries(u.searchParams); };
  it("validates signature, expiry and tampering", () => {
    const url = createPartnerMediaUrl("https://portal.test", "AST-001", "image", "PK-1");
    const p = parts(url);
    expect(verifyPartnerMediaSignature("AST-001", "image", p)).toBe(true);
    expect(verifyPartnerMediaSignature("AST-002", "image", p)).toBe(false);
    expect(verifyPartnerMediaSignature("AST-001", "motion", p)).toBe(false);
    expect(verifyPartnerMediaSignature("AST-001", "image", { ...p, key: "PK-2" })).toBe(false);
    expect(verifyPartnerMediaSignature("AST-001", "image", { ...p, exp: String(Number(p.exp) + 1) })).toBe(false);
    expect(verifyPartnerMediaSignature("AST-001", "image", p, (Number(p.exp) + 1) * 1000)).toBe(false);
    const far = partnerMediaExpiry() + 3600;
    expect(verifyPartnerMediaSignature("AST-001", "image", parts(createPartnerMediaUrl("https://portal.test", "AST-001", "image", "PK-1", far)))).toBe(false);
  });
  it("checks origin, serves preview bytes and never originals", async () => {
    const original = Buffer.from("ORIGINAL-SVGA");
    const ctx = setup({ assets: [asset(1, { mimeType: "application/svga", fileData: original })], key: { allowedOrigins: ["https://shop.example.com"] } });
    const preview = { id: "p1", kind: "POSTER", mimeType: "image/webp", data: Buffer.from("WEBP"), size: 4, sourceVersion: "v1:" };
    ctx.db.assetPreview.findUnique.mockResolvedValue(preview);
    const url = createPartnerMediaUrl("https://portal.test", "AST-001", "image", ctx.key.publicId).replace("https://portal.test", "");
    expect((await ctx.handlers.media(req(url), "AST-001", "image")).status).toBe(403);
    expect((await ctx.handlers.media(req(url, { referer: "https://evil.example/x" }), "AST-001", "image")).status).toBe(403);
    const ok = await ctx.handlers.media(req(url, { referer: "https://shop.example.com/catalog" }), "AST-001", "image");
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("image/webp");
    expect(ok.headers.get("cache-control")).toMatch(/^private/);
    expect(Buffer.from(await ok.arrayBuffer()).equals(original)).toBe(false);
    const motionUrl = createPartnerMediaUrl("https://portal.test", "AST-001", "motion", ctx.key.publicId).replace("https://portal.test", "");
    expect((await ctx.handlers.media(req(motionUrl, { origin: "https://shop.example.com" }), "AST-001", "motion")).status).toBe(404);
    expect((await ctx.handlers.media(req(url.replace(/sig=[^&]+/, "sig=bad"), { origin: "https://shop.example.com" }), "AST-001", "image")).status).toBe(403);
  });
  it("skips the origin check when no origins are configured and rejects revoked keys", async () => {
    const ctx = setup({ assets: [asset(1)] });
    ctx.db.assetPreview.findUnique.mockResolvedValue({ kind: "POSTER", mimeType: "image/webp", data: Buffer.from("W"), size: 1, sourceVersion: "v1:" });
    const url = createPartnerMediaUrl("https://portal.test", "AST-001", "image", ctx.key.publicId).replace("https://portal.test", "");
    expect((await ctx.handlers.media(req(url), "AST-001", "image")).status).toBe(200);
    ctx.key.revokedAt = new Date();
    expect((await ctx.handlers.media(req(url), "AST-001", "image")).status).toBe(403);
  });
  it("regenerates stale previews", async () => {
    const png = await sharp({ create: { width: 40, height: 20, channels: 3, background: "#f00" } }).png().toBuffer();
    const ctx = setup({ assets: [asset(1, { fileData: png })] });
    ctx.db.assetPreview.findUnique.mockResolvedValue({ kind: "POSTER", mimeType: "image/webp", data: Buffer.from("OLD"), size: 3, sourceVersion: "old" });
    const url = createPartnerMediaUrl("https://portal.test", "AST-001", "image", ctx.key.publicId).replace("https://portal.test", "");
    const res = await ctx.handlers.media(req(url), "AST-001", "image");
    expect(res.status).toBe(200);
    expect(ctx.db.assetPreview.upsert).toHaveBeenCalledTimes(1);
    expect(Buffer.from(await res.arrayBuffer()).subarray(8, 12).toString()).toBe("WEBP");
  });
});

describe("preview builder", () => {
  it("builds a WebP poster ≤512px and animated WebP motion for GIF, never the original", async () => {
    const gif = await sharp({ create: { width: 1200, height: 600, channels: 3, background: "#0a0" } }).gif().toBuffer();
    const a = { mimeType: "image/gif", fileData: gif, mediaVersion: "v", posterMediaVersion: null };
    const poster = await buildPreview(a, "POSTER");
    expect(poster.mimeType).toBe("image/webp");
    expect(Math.max(poster.width, poster.height)).toBeLessThanOrEqual(512);
    expect(poster.data.equals(gif)).toBe(false);
    const motion = await buildPreview(a, "MOTION");
    expect(motion.mimeType).toBe("image/webp");
    expect(motion.width).toBeLessThanOrEqual(480);
    expect(motion.data.equals(gif)).toBe(false);
  });
  it("omits MP4 motion when ffmpeg is unavailable and uses the uploaded poster", async () => {
    const previous = process.env.FFMPEG_PATH;
    process.env.FFMPEG_PATH = "/nonexistent/ffmpeg";
    resetFfmpegState();
    const posterPng = await sharp({ create: { width: 800, height: 800, channels: 3, background: "#00f" } }).png().toBuffer();
    const mp4 = { mimeType: "video/mp4", fileData: Buffer.from("not-a-real-mp4"), posterFileData: posterPng, mediaVersion: "m", posterMediaVersion: "p" };
    expect(await buildPreview(mp4, "MOTION")).toBeNull();
    const poster = await buildPreview(mp4, "POSTER");
    expect(poster.width).toBe(512);
    expect(poster.sourceVersion).toBe("m:p");
    expect(await buildPreview({ ...mp4, posterFileData: null }, "POSTER")).toBeNull();
    if (previous === undefined) delete process.env.FFMPEG_PATH; else process.env.FFMPEG_PATH = previous;
    resetFfmpegState();
  });
  it("extracts an SVGA image for the poster and never builds SVGA motion", async () => {
    const png = await sharp({ create: { width: 300, height: 300, channels: 4, background: "#ff0" } }).png().toBuffer();
    const svga = deflateSync(Buffer.concat([Buffer.from([1, 2, 3]), png, Buffer.from([9, 9])]));
    expect((await extractSvgaImage(svga)).equals(png)).toBe(true);
    const a = { mimeType: "application/svga", fileData: svga, mediaVersion: "s" };
    const poster = await buildPreview(a, "POSTER");
    expect(poster.mimeType).toBe("image/webp");
    expect(await buildPreview(a, "MOTION")).toBeNull();
  });
});

function storedZip(name, data, declaredSize = data.length) {
  const nameBuf = Buffer.from(name);
  const crc = crc32(data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(declaredSize, 22); local.writeUInt16LE(nameBuf.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(declaredSize, 24); central.writeUInt16LE(nameBuf.length, 28);
  const localPart = Buffer.concat([local, nameBuf, data]);
  const centralPart = Buffer.concat([central, nameBuf]);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(centralPart.length, 12); end.writeUInt32LE(localPart.length, 16);
  return Buffer.concat([localPart, centralPart, end]);
}

describe("hardening", () => {
  it("rate limits per IP before key lookup and does not cache misses", async () => {
    const { handlers, db } = setup();
    for (let i = 0; i < 120; i += 1) expect((await handlers.listItems(req("/api/partner/v1/items", { "x-partner-key": "mpk_bad", "x-forwarded-for": "203.0.113.9" }))).status).toBe(401);
    expect(db.partnerApiKey.findUnique).toHaveBeenCalledTimes(120);
    expect((await handlers.listItems(req("/api/partner/v1/items", { "x-partner-key": "mpk_bad", "x-forwarded-for": "203.0.113.9" }))).status).toBe(429);
    expect(db.partnerApiKey.findUnique).toHaveBeenCalledTimes(120);
  });
  it("requires PARTNER_MEDIA_BASE_URL in production and puts the base in the ETag", async () => {
    const env = { node: process.env.NODE_ENV, base: process.env.PARTNER_MEDIA_BASE_URL };
    try {
      process.env.NODE_ENV = "production";
      delete process.env.PARTNER_MEDIA_BASE_URL;
      const a = setup({ assets: [asset(1)] });
      const fail = await a.handlers.listItems(req("/api/partner/v1/items", { "x-partner-key": a.raw, "x-forwarded-host": "evil.example" }));
      expect(fail.status).toBe(500);
      process.env.PARTNER_MEDIA_BASE_URL = "https://api.megachat.test";
      const ok = await a.handlers.listItems(req("/api/partner/v1/items", { "x-partner-key": a.raw, "x-forwarded-host": "evil.example" }));
      const body = await ok.json();
      expect(body.data.items[0].media.image.startsWith("https://api.megachat.test/")).toBe(true);
      const etag1 = ok.headers.get("etag");
      process.env.PARTNER_MEDIA_BASE_URL = "https://other.megachat.test";
      const again = await a.handlers.listItems(req("/api/partner/v1/items", { "x-partner-key": a.raw }));
      expect(again.headers.get("etag")).not.toBe(etag1);
    } finally {
      process.env.NODE_ENV = env.node;
      if (env.base === undefined) delete process.env.PARTNER_MEDIA_BASE_URL; else process.env.PARTNER_MEDIA_BASE_URL = env.base;
    }
  });
  it("reports removed ids from tombstones, items win over removed", async () => {
    const recent = new Date(Date.now() - 3600000);
    const since = new Date(Date.now() - 7200000);
    const assets = [asset(1, { updatedAt: recent }), asset(2, { storeVisible: false, updatedAt: recent }), asset(5, { updatedAt: recent })];
    const removals = [
      { id: "t1", assetPublicId: "AST-002", removedAt: recent },
      { id: "t2", assetPublicId: "AST-009", removedAt: recent },
      { id: "t3", assetPublicId: "AST-005", removedAt: recent },
      { id: "t0", assetPublicId: "AST-008", removedAt: new Date(since.getTime() - 1000) },
      { id: "t4", assetPublicId: "AST-010", removedAt: since },
    ];
    const { handlers, raw } = setup({ assets, removals });
    const body = await (await handlers.listItems(req(`/api/partner/v1/items?updatedSince=${since.toISOString()}`, { "x-partner-key": raw }))).json();
    expect(body.data.items.map((i) => i.id)).toEqual(["AST-001", "AST-005"]);
    expect(body.data.removed).toEqual(["AST-010", "AST-002", "AST-009"]);
    expect(body.data.removedTruncated).toBe(false);
    expect(body.data.removedCursor).toBeNull();
    const full = await (await handlers.listItems(req("/api/partner/v1/items", { "x-partner-key": raw }))).json();
    expect(full.data).not.toHaveProperty("removed");
  });
  it("pages removed ids and flags full sync past retention", async () => {
    const since = new Date(Date.now() - 86400000);
    const removals = Array.from({ length: 1005 }, (_, i) => ({ id: `t${String(i).padStart(5, "0")}`, assetPublicId: `GONE-${i}`, removedAt: new Date(since.getTime() + 1000 + i) }));
    const { handlers, raw } = setup({ removals });
    const first = await (await handlers.listItems(req(`/api/partner/v1/items?updatedSince=${since.toISOString()}`, { "x-partner-key": raw }))).json();
    expect(first.data.removed).toHaveLength(1000);
    expect(first.data.removedTruncated).toBe(true);
    const next = await (await handlers.listItems(req(`/api/partner/v1/items?updatedSince=${since.toISOString()}&removedCursor=${first.data.removedCursor}`, { "x-partner-key": raw }))).json();
    expect(next.data.removed).toEqual(["GONE-1000", "GONE-1001", "GONE-1002", "GONE-1003", "GONE-1004"]);
    expect(next.data.removedTruncated).toBe(false);
    const old = await (await handlers.listItems(req(`/api/partner/v1/items?updatedSince=${new Date(Date.now() - 91 * 86400000).toISOString()}`, { "x-partner-key": raw }))).json();
    expect(old.data.fullSyncRequired).toBe(true);
    expect(old.data).not.toHaveProperty("removed");
    expect((await handlers.listItems(req("/api/partner/v1/items?removedCursor=abc", { "x-partner-key": raw }))).status).toBe(400);
  });
  it("aborts capped stream reads", async () => {
    let produced = 0;
    const stream = new Readable({ read() { produced += 1; this.push(produced > 1000 ? null : Buffer.alloc(1024)); } });
    expect(await readCapped(stream, 10 * 1024)).toBeNull();
    expect(stream.destroyed).toBe(true);
    expect(produced).toBeLessThan(1000);
    expect((await readCapped(Readable.from([Buffer.from("ab"), Buffer.from("c")]), 10)).toString()).toBe("abc");
  });
  it("adds CORS for a matched media origin", async () => {
    const ctx = setup({ assets: [asset(1)], key: { allowedOrigins: ["https://shop.example.com"] } });
    ctx.db.assetPreview.findUnique.mockResolvedValue({ kind: "POSTER", mimeType: "image/webp", data: Buffer.from("W"), size: 1, sourceVersion: "v1:" });
    const url = createPartnerMediaUrl("https://portal.test", "AST-001", "image", ctx.key.publicId).replace("https://portal.test", "");
    const res = await ctx.handlers.media(req(url, { origin: "https://shop.example.com" }), "AST-001", "image");
    expect(res.headers.get("access-control-allow-origin")).toBe("https://shop.example.com");
    expect(res.headers.get("vary")).toMatch(/Origin/);
  });
  it("limits concurrent preview jobs and returns 503 when the queue is full", async () => {
    const releases = [];
    const db = { assetPreview: { findUnique: vi.fn(async () => null), upsert: vi.fn() }, uploadAsset: { findUnique: vi.fn(() => new Promise((resolve) => releases.push(() => resolve(null)))) } };
    const jobs = Array.from({ length: 10 }, (_, i) => ensurePreview(db, { id: `c${i}`, publicId: `C${i}`, mimeType: "image/png", mediaVersion: "x" }, "POSTER"));
    await new Promise((r) => setTimeout(r, 0));
    expect(db.uploadAsset.findUnique).toHaveBeenCalledTimes(2);
    await expect(ensurePreview(db, { id: "c99", publicId: "C99", mimeType: "image/png", mediaVersion: "x" }, "POSTER")).rejects.toMatchObject({ status: 503, code: "PREVIEW_BUSY" });
    while (releases.length) { releases.shift()(); await new Promise((r) => setTimeout(r, 0)); }
    expect(await Promise.all(jobs)).toEqual(Array(10).fill(null));
  });
  it("caches failures per asset, kind and version", async () => {
    const db = { assetPreview: { findUnique: vi.fn(async () => null), upsert: vi.fn() }, uploadAsset: { findUnique: vi.fn(async () => ({ id: "f1", mimeType: "audio/mpeg", fileData: Buffer.from("x") })) } };
    const a = { id: "f1", publicId: "F1", mimeType: "audio/mpeg", mediaVersion: "1" };
    expect(await ensurePreview(db, a, "POSTER")).toBeNull();
    expect(await ensurePreview(db, a, "POSTER")).toBeNull();
    expect(db.uploadAsset.findUnique).toHaveBeenCalledTimes(1);
    await ensurePreview(db, { ...a, mediaVersion: "2" }, "POSTER");
    expect(db.uploadAsset.findUnique).toHaveBeenCalledTimes(2);
  });
  it("skips SVGA zip entries above the size cap", async () => {
    const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#123" } }).png().toBuffer();
    expect((await extractSvgaImage(storedZip("a.png", png))).equals(png)).toBe(true);
    expect(await extractSvgaImage(storedZip("a.png", png, 30 * 1024 * 1024))).toBeNull();
  });
  it("caps GIF motion frames", async () => {
    const frames = await Promise.all(Array.from({ length: 100 }, (_, i) => sharp({ create: { width: 16, height: 16, channels: 3, background: { r: i, g: 0, b: 0 } } }).png().toBuffer()));
    const gif = await sharp(frames, { join: { animated: true } }).gif().toBuffer();
    const motion = await buildPreview({ mimeType: "image/gif", fileData: gif, mediaVersion: "g" }, "MOTION");
    expect((await sharp(motion.data).metadata()).pages).toBeLessThanOrEqual(90);
  });
});
