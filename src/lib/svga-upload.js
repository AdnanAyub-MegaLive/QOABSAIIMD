import { inflate, crc32 } from "node:zlib";
import { promisify } from "node:util";
import unzipper from "unzipper";
import sharp from "sharp";
import { SVGA_MAX_BYTES } from "./svga-policy.js";

const unzip = promisify(inflate);
const EXPANDED_LIMIT = 16 * 1024 * 1024;
const safeName = /^[a-zA-Z0-9_-][a-zA-Z0-9_.-]{0,127}$/;
const utf8 = new TextDecoder("utf-8", { fatal: true });
function fail(message) {
  throw Object.assign(new Error(`SVGA: ${message}`), { code: "VALIDATION_ERROR", status: 422 });
}
function check(condition, message) { if (!condition) fail(message); }
function name(value) {
  check(typeof value === "string" && safeName.test(value) && !["__proto__", "constructor", "prototype"].includes(value), "invalid embedded resource name.");
  return value;
}
function resourceName(value) {
  // Layer identifiers are not filenames. Official exporters emit Unicode names.
  check(typeof value === "string" && value.length > 0 && value.length <= 128 && !/[\\/:<>\u0000-\u001f]/.test(value) && !["__proto__", "constructor", "prototype"].includes(value), "invalid layer identifier.");
  return value;
}

// Strict, bounded wire decoder for the official SVGA 2 MovieEntity schema.
// Unknown fields/wire types are rejected rather than passed unchecked to a player.
// Schema: https://github.com/svga/SVGA-Format/blob/master/proto/svga.proto
const floats = (...names) => Object.fromEntries(names.map((n, i) => [i + 1, [n, "float"]]));
const layout = floats("x", "y", "width", "height");
const transform = floats("a", "b", "c", "d", "tx", "ty");
const color = floats("r", "g", "b", "a");
const styles = { 1: ["fill", color], 2: ["stroke", color], 3: ["strokeWidth", "float"], 4: ["lineCap", "int"], 5: ["lineJoin", "int"], 6: ["miterLimit", "float"], 7: ["lineDashI", "float"], 8: ["lineDashII", "float"], 9: ["lineDashIII", "float"] };
const shape = { 1: ["type", "int"], 2: ["shape", { 1: ["d", "str"] }], 3: ["rect", floats("x", "y", "width", "height", "cornerRadius")], 4: ["ellipse", floats("x", "y", "radiusX", "radiusY")], 10: ["styles", styles], 11: ["transform", transform] };
const frame = { 1: ["alpha", "float"], 2: ["layout", layout], 3: ["transform", transform], 4: ["clipPath", "str"], 5: ["shapes", shape, true] };
const movieSchema = {
  1: ["version", "str"],
  2: ["params", { 1: ["viewBoxWidth", "float"], 2: ["viewBoxHeight", "float"], 3: ["fps", "int"], 4: ["frames", "int"] }],
  3: ["images", { 1: ["key", "str"], 2: ["value", "bytes"] }, true],
  4: ["sprites", { 1: ["imageKey", "str"], 2: ["frames", frame, true], 3: ["matteKey", "str"] }, true],
  // Embedded audio is deliberately unsupported; even an empty audio message is rejected.
};
function decodeWire(bytes, schema, budget = { fields: 0 }, depth = 0) {
  check(depth <= 8, "message nesting is too deep.");
  let offset = 0;
  const result = Object.create(null);
  function integer() {
    let value = 0;
    for (let i = 0; i < 5; i++) {
      check(offset < bytes.length, "truncated binary data.");
      const b = bytes[offset++]; value += (b & 127) * 2 ** (7 * i);
      if (!(b & 128)) { check(value <= 0xffffffff, "invalid integer."); return value; }
    }
    fail("invalid integer encoding.");
  }
  while (offset < bytes.length) {
    check(++budget.fields <= 300000, "too many animation fields.");
    const tag = integer(), field = schema[Math.floor(tag / 8)], wire = tag % 8;
    check(Boolean(field), "unknown animation field or embedded audio; export a silent SVGA 1/2 file.");
    const [key, type, repeated] = field;
    check(repeated || !Object.hasOwn(result, key), "duplicate animation field.");
    let value;
    if (type === "int") { check(wire === 0, "invalid integer field."); value = integer(); }
    else if (type === "float") {
      check(wire === 5 && offset + 4 <= bytes.length, "invalid float field.");
      value = bytes.readFloatLE(offset); offset += 4;
      check(Number.isFinite(value) && Math.abs(value) <= 1000000, "invalid geometry.");
    } else {
      check(wire === 2, "invalid binary field.");
      const length = integer(); check(offset + length <= bytes.length, "truncated binary field.");
      const data = bytes.subarray(offset, offset + length); offset += length;
      if (type === "str") { check(length <= 8192, "text or path is too large."); value = utf8.decode(data); }
      else if (type === "bytes") value = data;
      else value = decodeWire(data, type, budget, depth + 1);
    }
    if (repeated) {
      const list = result[key] ??= [];
      check(list.length < (key === "frames" ? 1800 : 128), "too many frames, shapes or resources.");
      list.push(value);
    } else result[key] = value;
  }
  return result;
}

async function raster(bytes) {
  const image = sharp(bytes, { limitInputPixels: 4194304, failOn: "warning" });
  const meta = await image.metadata();
  check(["png", "jpeg", "webp"].includes(meta.format) && (meta.pages ?? 1) === 1, "embedded resources must be static PNG, JPEG or WebP images (no SVG or audio).");
  check(meta.width <= 2048 && meta.height <= 2048, "embedded image exceeds 2048 pixels.");
  await image.timeout({ seconds: 5 }).raw().toBuffer(); // Decode pixels, not just the header.
  return meta.width * meta.height;
}

async function readArchive(bytes) {
  // Reject huge/ZIP64/multi-disk directories before the ZIP library allocates
  // one object per entry. The small file-count limit must apply before parsing.
  const end = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  check(end >= Math.max(0, bytes.length - 65557) && end + 22 <= bytes.length, "missing ZIP directory.");
  const entries = bytes.readUInt16LE(end + 10);
  check(bytes.readUInt16LE(end + 4) === 0 && bytes.readUInt16LE(end + 6) === 0 && bytes.readUInt16LE(end + 8) === entries && entries > 0 && entries <= 129, "unsupported or oversized ZIP directory.");
  check(end + 22 + bytes.readUInt16LE(end + 20) === bytes.length && bytes.readUInt32LE(end + 12) + bytes.readUInt32LE(end + 16) === end, "invalid ZIP directory bounds.");
  const archive = await unzipper.Open.buffer(bytes);
  check(archive.files.length > 0 && archive.files.length <= 129, "too many archive entries.");
  const files = new Map(); let expanded = 0;
  for (const entry of archive.files) {
    name(entry.path);
    check(entry.type === "File" && !files.has(entry.path) && !(entry.flags & 1) && [0, 8].includes(entry.compressionMethod), "unsafe, duplicate or encrypted archive entry.");
    check(((entry.externalFileAttributes >>> 16) & 0xf000) !== 0xa000, "archive links are not allowed.");
    check(!entry.uncompressedSize || entry.uncompressedSize <= EXPANDED_LIMIT - expanded, "expanded archive is too large.");
    const parts = []; let size = 0;
    for await (const chunk of entry.stream()) {
      size += chunk.length; expanded += chunk.length;
      check(expanded <= EXPANDED_LIMIT, "expanded archive exceeds 16 MB.");
      parts.push(chunk);
    }
    check(size === entry.uncompressedSize, "archive size does not match its directory.");
    const data = Buffer.concat(parts, size);
    check(crc32(data) === entry.crc32, "archive checksum mismatch.");
    files.set(entry.path, data);
  }
  check(files.has("movie.spec") !== files.has("movie.binary"), "archive must have exactly one movie.spec or movie.binary.");
  return files;
}

function inspectTree(value, budget = { nodes: 0, paths: 0 }, depth = 0) {
  check(depth <= 12 && ++budget.nodes <= 300000, "animation is too complex.");
  if (typeof value === "number") check(Number.isFinite(value) && Math.abs(value) <= 1000000, "invalid geometry.");
  if (typeof value === "string") check(value.length <= 8192 && !/[<>]|(?:https?|file|data|javascript):/i.test(value), "external resources and markup are not allowed.");
  if (value && typeof value === "object") for (const [key, child] of Object.entries(value)) {
    check(!["__proto__", "constructor", "prototype"].includes(key), "unsafe object key.");
    if ((key === "d" && typeof child === "string") || key === "clipPath") {
      check(typeof child === "string" && /^[MmLlHhVvCcSsQqTtAaZz0-9eE+.,\s-]*$/.test(child), "invalid vector path.");
      budget.paths += child.length; check(budget.paths <= 2 * 1024 * 1024, "too much vector path data.");
    }
    inspectTree(child, budget, depth + 1);
  }
}

let validating = 0;
export async function validateSvga(bytes) {
  check(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= SVGA_MAX_BYTES, "file must be at most 8 MB.");
  if (validating >= 2) throw Object.assign(new Error("Animation validation is busy. Please retry shortly."), { code: "UPLOAD_BUSY", status: 429 });
  validating++;
  try {
    const files = bytes.readUInt16LE(0) === 0x4b50 ? await readArchive(bytes) : null;
    let movie, images;
    if (files?.has("movie.spec")) {
      const spec = files.get("movie.spec"); check(spec.length <= 2 * 1024 * 1024, "JSON animation is too large.");
      movie = JSON.parse(utf8.decode(spec));
      check(/^1\./.test(movie.ver), "unsupported JSON version.");
      inspectTree(movie);
      check(movie.images && !Array.isArray(movie.images) && typeof movie.images === "object", "missing image dictionary.");
      images = Object.entries(movie.images).map(([key, file]) => {
        resourceName(key); name(file);
        // SVGA 1 exporters commonly omit the .png suffix in the image map.
        const resolved = files.has(file) ? file : `${file}.png`;
        check(files.has(resolved), "embedded image is missing.");
        return [key, files.get(resolved), resolved];
      });
      movie.params = { viewBoxWidth: movie.movie?.viewBox?.width, viewBoxHeight: movie.movie?.viewBox?.height, fps: movie.movie?.fps, frames: movie.movie?.frames };
    } else {
      const binary = files ? files.get("movie.binary") : await unzip(bytes, { maxOutputLength: EXPANDED_LIMIT });
      movie = decodeWire(binary, movieSchema);
      check(/^2\./.test(movie.version), "unsupported binary version.");
      images = (movie.images ?? []).map(({ key, value }) => {
        resourceName(key); check(Buffer.isBuffer(value) && value.length > 0, "missing embedded image.");
        if (files && value.length <= 128) {
          const path = value.toString("utf8");
          if (files.has(path)) return [key, files.get(path), path];
        }
        return [key, value];
      });
      inspectTree({ ...movie, images: undefined });
    }
    check(!movie.audios?.length, "embedded audio is not supported; export a silent animation.");
    const p = movie.params;
    check(p && Number.isFinite(p.viewBoxWidth) && Number.isFinite(p.viewBoxHeight) && p.viewBoxWidth > 0 && p.viewBoxWidth <= 2048 && p.viewBoxHeight > 0 && p.viewBoxHeight <= 2048, "canvas must be within 2048 × 2048.");
    check(Number.isInteger(p.fps) && p.fps >= 1 && p.fps <= 60 && Number.isInteger(p.frames) && p.frames > 0 && p.frames <= 1800 && p.frames / p.fps <= 30, "animation must be at most 30 seconds and 60 FPS.");
    check(images.length <= 128 && new Set(images.map(([key]) => key)).size === images.length, "too many or duplicate images.");
    if (files) {
      const used = new Set(["movie.spec", "movie.binary", ...images.map(([, , file]) => file)]);
      check([...files.keys()].every(key => used.has(key)), "archive contains unused or unsupported files.");
    }
    let pixels = 0;
    for (const [, data] of images) { pixels += await raster(data); check(pixels <= 16777216, "total decoded images exceed 16 megapixels."); }
    const keys = new Set(images.map(([key]) => key)), sprites = movie.sprites;
    check(Array.isArray(sprites) && sprites.length > 0 && sprites.length <= 128, "animation must contain 1–128 sprites.");
    const spriteKeys = new Set(sprites.map(sprite => sprite.imageKey));
    let frames = 0, shapes = 0;
    for (const sprite of sprites) {
      resourceName(sprite.imageKey);
      check(keys.has(sprite.imageKey) || sprite.imageKey.endsWith(".vector") || (sprite.imageKey.endsWith(".matte") && keys.has(sprite.imageKey.slice(0, -6))), "sprite references a missing image.");
      check(!sprite.matteKey || spriteKeys.has(sprite.matteKey), "missing matte sprite.");
      const seen = new Set([sprite.imageKey]);
      let matte = sprite.matteKey;
      while (matte) {
        check(!seen.has(matte), "cyclic matte references."); seen.add(matte);
        matte = sprites.find(s => s.imageKey === matte)?.matteKey;
      }
      check(Array.isArray(sprite.frames) && sprite.frames.length > 0 && sprite.frames.length <= p.frames, "invalid sprite frame count.");
      frames += sprite.frames.length; check(frames <= 40000, "too many total sprite frames.");
      for (const frame of sprite.frames) {
        check(frame && typeof frame === "object" && !Array.isArray(frame), "invalid frame.");
        if (frame.alpha !== undefined) check(typeof frame.alpha === "number" && frame.alpha >= 0 && frame.alpha <= 1, "invalid opacity.");
        check(!frame.shapes || Array.isArray(frame.shapes), "invalid shapes.");
        shapes += frame.shapes?.length ?? 0;
        check((frame.shapes?.length ?? 0) <= 64 && shapes <= 20000, "too many vector shapes.");
        for (const item of frame.shapes ?? []) {
          const type = typeof item?.type === "string" ? ["shape", "rect", "ellipse", "keep"].indexOf(item.type) : item?.type ?? 0;
          check(item && Number.isInteger(type) && type >= 0 && type <= 3, "invalid vector shape type.");
          if (type !== 3) {
            const args = item.args ?? item[["shape", "rect", "ellipse"][type]];
            check(args && typeof args === "object" && !Array.isArray(args), "missing vector shape arguments.");
            if (type === 0) check(typeof args.d === "string", "missing vector path.");
          }
        }
      }
    }
    return { version: movie.ver ?? movie.version, width: p.viewBoxWidth, height: p.viewBoxHeight, fps: p.fps, frames: p.frames };
  } catch (error) {
    if (error.code === "VALIDATION_ERROR") throw error;
    fail("malformed, corrupt or unsupported animation.");
  } finally { validating--; }
}

export async function decodeUploadPoster(file) {
  if (!file || !file.size) return null;
  check(file.size <= 5 * 1024 * 1024 && ["image/png", "image/jpeg", "image/webp"].includes(file.type), "poster must be PNG, JPEG or WebP, at most 5 MB.");
  try {
    const image = sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 16777216, failOn: "warning" });
    const meta = await image.metadata();
    check(({ png: "image/png", jpeg: "image/jpeg", webp: "image/webp" })[meta.format] === file.type && (meta.pages ?? 1) === 1, "poster content does not match its declared type.");
    const bytes = await image.resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true }).timeout({ seconds: 5 }).webp().toBuffer();
    return { posterFileData: bytes, posterFileSize: bytes.length, posterMimeType: "image/webp", posterFileName: "poster.webp" };
  } catch (error) {
    if (error.code === "VALIDATION_ERROR") throw error;
    fail("poster is corrupt or too complex.");
  }
}
