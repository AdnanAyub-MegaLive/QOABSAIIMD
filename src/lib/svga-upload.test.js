import { describe, it, expect } from "vitest";
import { deflateSync, crc32 } from "node:zlib";
import sharp from "sharp";
import { validateSvga, decodeUploadPoster } from "./svga-upload.js";
import { uploadMimeType, SVGA_MIME, SVGA_CATEGORIES } from "./svga-policy.js";
import { validateUploadAssetContract } from "./upload-assets.js";

function varint(n) { const b = []; do { const v = n & 127; n >>>= 7; b.push(v | (n ? 128 : 0)); } while (n); return Buffer.from(b); }
function field(id, value, type = "bytes") {
  if (type === "int") return Buffer.concat([varint(id * 8), varint(value)]);
  if (type === "float") { const b = Buffer.alloc(4); b.writeFloatLE(value); return Buffer.concat([varint(id * 8 + 5), b]); }
  const b = Buffer.from(value); return Buffer.concat([varint(id * 8 + 2), varint(b.length), b]);
}
async function png() { return sharp({ create: { width: 8, height: 8, channels: 4, background: "red" } }).png().toBuffer(); }
async function binary({ width = 100, fps = 20, frames = 1, image, extra = Buffer.alloc(0), path = "" } = {}) {
  const params = Buffer.concat([field(1, width, "float"), field(2, 100, "float"), field(3, fps, "int"), field(4, frames, "int")]);
  const sprite = Buffer.concat([field(1, "picture"), field(2, field(4, path))]);
  return Buffer.concat([field(1, "2.0"), field(2, params), field(3, Buffer.concat([field(1, "picture"), field(2, image ?? await png())])), field(4, sprite), extra]);
}
// Minimal stored ZIP builder, fixtures are generated locally (no downloaded artwork).
function zip(entries) {
  const parts = [], directory = []; let offset = 0;
  for (const [name, bytes] of entries) {
    const data = Buffer.from(bytes), filename = Buffer.from(name), crc = crc32(data);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(filename.length, 26);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(filename.length, 28); central.writeUInt32LE(offset, 42);
    parts.push(local, filename, data); directory.push(central, filename); offset += local.length + filename.length + data.length;
  }
  const dir = Buffer.concat(directory), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, dir, end]);
}
function jsonMovie() { return { ver: "1.1.0", movie: { viewBox: { width: 100, height: 100 }, fps: 20, frames: 1 }, images: { picture: "picture" }, sprites: [{ imageKey: "picture", frames: [{ alpha: 1, shapes: [] }] }] }; }

describe("SVGA upload validation", () => {
  it("accepts zlib/protobuf SVGA 2 without changing the original bytes", async () => {
    const bytes = deflateSync(await binary()), original = Buffer.from(bytes);
    expect(await validateSvga(bytes)).toEqual({ version: "2.0", width: 100, height: 100, fps: 20, frames: 1 });
    expect(bytes.equals(original)).toBe(true);
  });
  it("accepts SVGA 1 ZIP with extensionless image names", async () => {
    expect((await validateSvga(zip([["movie.spec", JSON.stringify(jsonMovie())], ["picture.png", await png()]]))).version).toBe("1.1.0");
  });
  it("accepts ZIP movie.binary and embedded image data", async () => {
    expect((await validateSvga(zip([["movie.binary", await binary()]]))).version).toBe("2.0");
  });
  it("accepts Unicode vector layer identifiers without allowing archive paths", async () => {
    const m = jsonMovie(); m.sprites.push({ imageKey: "形状图层1.vector", frames: [{ alpha: 1, shapes: [{ type: "rect", args: { x: 0, y: 0, width: 10, height: 10 } }] }] });
    expect((await validateSvga(zip([["movie.spec", JSON.stringify(m)], ["picture.png", await png()]]))).version).toBe("1.1.0");
  });
  it("rejects excessive frame/shape budgets and matte cycles", async () => {
    for (const change of [
      m => { m.sprites[0].frames[0].shapes = Array.from({ length: 65 }, () => ({ type: "keep" })); },
      m => { m.sprites = Array.from({ length: 129 }, () => m.sprites[0]); },
      m => { m.sprites[0].matteKey = "picture"; },
      m => { m.sprites[0].frames[0].shapes = [{ type: "unknown" }]; },
    ]) {
      const m = jsonMovie(); change(m);
      await expect(validateSvga(zip([["movie.spec", JSON.stringify(m)], ["picture.png", await png()]]))).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    }
  });
  it("normalizes generic browser MIME but restricts categories", () => {
    expect(uploadMimeType({ name: "gift.SVGA", type: "application/octet-stream" })).toBe(SVGA_MIME);
    for (const category of SVGA_CATEGORIES) expect(validateUploadAssetContract({ category, mimeType: SVGA_MIME })).toEqual({ placement: null });
    for (const category of ["BANNERS", "MUSIC_TRACKS", "ROOM_BACKGROUNDS", "SEAT_STYLES", "BUSINESS_CARD", "AGENCY_ARTWORK"]) expect(() => validateUploadAssetContract({ category, mimeType: SVGA_MIME })).toThrow("SVGA");
  });
  it.each([Buffer.alloc(0), Buffer.from("fake.svga"), Buffer.alloc(8 * 1024 * 1024 + 1), deflateSync(Buffer.alloc(17 * 1024 * 1024))])("rejects empty, fake, oversized and decompression bomb input", async bytes => {
    await expect(validateSvga(bytes)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
  it.each([{ width: 10000 }, { fps: 61 }, { frames: 601 }, { width: Infinity }, { path: "<script>alert(1)</script>" }, { image: Buffer.from("https://evil.example/image.png") }, { extra: field(5, Buffer.alloc(0)) }])("rejects excessive complexity, unsafe images/paths and audio: %j", async options => {
    await expect(validateSvga(deflateSync(await binary(options)))).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
  it("rejects traversal, duplicates, unexpected files, external references and corrupt images", async () => {
    const m = JSON.stringify(jsonMovie()), image = await png();
    for (const entries of [
      [["../movie.spec", m]],
      [["movie.spec", m], ["movie.spec", m]],
      [["movie.spec", m], ["picture.png", image], ["evil.js", "alert(1)"]],
      [["movie.spec", m], ["picture.png", "not png"]],
      [["movie.spec", JSON.stringify({ ...jsonMovie(), images: { picture: "https://evil.test/a" } })]],
    ]) await expect(validateSvga(zip(entries))).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
  it("rejects corrupted ZIP checksums", async () => {
    const bytes = zip([["movie.binary", await binary()]]); bytes[14] ^= 1; bytes[bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])) + 16] ^= 1;
    await expect(validateSvga(bytes)).rejects.toThrow("checksum");
  });
  it("allows no poster and re-encodes a valid poster to bounded WebP", async () => {
    expect(await decodeUploadPoster(null)).toBeNull();
    const poster = await decodeUploadPoster(new File([await png()], "poster.png", { type: "image/png" }));
    expect(poster.posterMimeType).toBe("image/webp");
    expect((await sharp(poster.posterFileData).metadata()).format).toBe("webp");
  });
  it("rejects a corrupt, MIME-mismatched or non-image poster", async () => {
    for (const file of [new File([await png()], "poster.jpg", { type: "image/jpeg" }), new File(["bad"], "poster.png", { type: "image/png" }), new File(["<svg/>"], "poster.svg", { type: "image/svg+xml" })]) await expect(decodeUploadPoster(file)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});
