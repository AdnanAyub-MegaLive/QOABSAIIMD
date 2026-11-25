import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { inflateSync } from "node:zlib";
import sharp from "sharp";
import unzipper from "unzipper";
import { PartnerApiError } from "./partner-auth.js";

const exec = promisify(execFile);
const POSTER_MAX = 512;
const MOTION_MAX = 480;
const MOTION_SECONDS = 3;
const SVGA_ENTRY_MAX = 20 * 1024 * 1024;
const GIF_MAX_PAGES = 90;
const GIF_MOTION_MAX_BYTES = 3 * 1024 * 1024;
const PREVIEW_MAX_BYTES = 5 * 1024 * 1024;
const MAX_ACTIVE_JOBS = 2;
const MAX_QUEUED_JOBS = 8;
const FAILURE_TTL_MS = 10 * 60 * 1000;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_END = Buffer.from([0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
const globalState = globalThis;
const locks = globalState.partnerPreviewLocks ??= new Map();
const failures = globalState.partnerPreviewFailures ??= new Map();
const jobState = globalState.partnerPreviewJobs ??= { active: 0, queue: [] };
let ffmpegState = null;

export const ffmpegPath = () => process.env.FFMPEG_PATH || "ffmpeg";

export async function ffmpegAvailable() {
  if (ffmpegState && ffmpegState.checkedAt > Date.now() - 10 * 60 * 1000) return ffmpegState.ok;
  let ok = false;
  try { await exec(ffmpegPath(), ["-hide_banner", "-version"], { timeout: 5000, windowsHide: true }); ok = true; } catch { ok = false; }
  ffmpegState = { ok, checkedAt: Date.now() };
  return ok;
}

export function resetFfmpegState() { ffmpegState = null; }

export function hasMotionSource(asset) {
  return asset.mimeType === "video/mp4" || asset.mimeType === "image/gif";
}

export function previewSourceVersion(asset, kind) {
  return kind === "POSTER" ? `${asset.mediaVersion ?? ""}:${asset.posterMediaVersion ?? ""}` : String(asset.mediaVersion ?? "");
}

function largestPng(buffer) {
  let best = null;
  let index = buffer.indexOf(PNG_SIGNATURE);
  while (index !== -1) {
    const end = buffer.indexOf(PNG_END, index);
    if (end === -1) break;
    const png = buffer.subarray(index, end + PNG_END.length);
    if (!best || png.length > best.length) best = png;
    index = buffer.indexOf(PNG_SIGNATURE, end);
  }
  return best;
}

export async function extractSvgaImage(bytes) {
  const buffer = Buffer.from(bytes);
  if (buffer[0] === 0x50 && buffer[1] === 0x4b) {
    const directory = await unzipper.Open.buffer(buffer);
    const files = directory.files.filter((file) => file.type === "File" && /\.png$/i.test(file.path) && file.uncompressedSize <= SVGA_ENTRY_MAX).sort((a, b) => b.uncompressedSize - a.uncompressedSize);
    for (const file of files) {
      const data = await readCapped(file.stream(), SVGA_ENTRY_MAX);
      if (data) return data;
    }
    return null;
  }
  let inflated = buffer;
  try { inflated = inflateSync(buffer, { maxOutputLength: 64 * 1024 * 1024 }); } catch { inflated = buffer; }
  return largestPng(inflated);
}

export function readCapped(stream, max) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0, done = false;
    const finish = (value) => { if (!done) { done = true; resolve(value); } };
    stream.on("data", (chunk) => {
      total += chunk.length;
      if (total > max) { stream.destroy(); chunks.length = 0; finish(null); return; }
      chunks.push(chunk);
    });
    stream.on("end", () => finish(Buffer.concat(chunks)));
    stream.on("close", () => finish(total > max ? null : Buffer.concat(chunks)));
    stream.on("error", (error) => { if (!done) { done = true; reject(error); } });
  });
}

async function withTempDir(task) {
  const dir = await mkdtemp(join(tmpdir(), "partner-preview-"));
  try { return await task(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}

async function videoFrame(bytes) {
  return withTempDir(async (dir) => {
    const input = join(dir, "in.mp4"), output = join(dir, "frame.png");
    await writeFile(input, bytes);
    await exec(ffmpegPath(), ["-v", "error", "-protocol_whitelist", "file", "-i", input, "-frames:v", "1", "-an", output], { timeout: 20000, maxBuffer: 256 * 1024, windowsHide: true });
    return readFile(output);
  });
}

async function videoClip(bytes) {
  return withTempDir(async (dir) => {
    const input = join(dir, "in.mp4"), output = join(dir, "out.mp4");
    await writeFile(input, bytes);
    await exec(ffmpegPath(), ["-v", "error", "-protocol_whitelist", "file", "-i", input, "-t", String(MOTION_SECONDS), "-an", "-map_metadata", "-1", "-map_chapters", "-1",
      "-vf", `scale=w='min(${MOTION_MAX},iw)':h='min(${MOTION_MAX},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,fps=24`,
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "32", "-maxrate", "400k", "-bufsize", "800k", "-pix_fmt", "yuv420p", "-threads", "2", "-movflags", "+faststart", output],
      { timeout: 120000, maxBuffer: 256 * 1024, windowsHide: true });
    return readFile(output);
  });
}

async function posterSource(asset) {
  if (asset.posterFileData?.length) return Buffer.from(asset.posterFileData);
  const mime = asset.mimeType;
  if (["image/png", "image/jpeg", "image/webp", "image/gif"].includes(mime)) return Buffer.from(asset.fileData);
  if (mime === "video/mp4") return (await ffmpegAvailable()) ? videoFrame(asset.fileData) : null;
  if (mime === "application/svga") return extractSvgaImage(asset.fileData);
  return null;
}

function assertNotOriginal(asset, data) {
  const originals = [asset.fileData, asset.posterFileData].filter(Boolean).map((value) => Buffer.from(value));
  if (originals.some((original) => original.equals(data))) throw new Error("Preview output matches an original file.");
}

export async function buildPreview(asset, kind) {
  let pipeline, mimeType;
  if (kind === "POSTER") {
    const source = await posterSource(asset);
    if (!source) return null;
    const { data, info } = await sharp(source, { animated: false, limitInputPixels: 64e6 }).rotate().resize(POSTER_MAX, POSTER_MAX, { fit: "inside", withoutEnlargement: true }).webp({ quality: 75 }).toBuffer({ resolveWithObject: true });
    pipeline = { data, width: info.width, height: info.height };
    mimeType = "image/webp";
  } else if (kind === "MOTION" && asset.mimeType === "image/gif") {
    const sourcePages = (await sharp(asset.fileData, { limitInputPixels: 64e6 }).metadata()).pages ?? 1;
    const { data, info } = await sharp(asset.fileData, { animated: true, pages: Math.min(sourcePages, GIF_MAX_PAGES), limitInputPixels: 64e6 }).resize(MOTION_MAX, MOTION_MAX, { fit: "inside", withoutEnlargement: true }).webp({ quality: 55, effort: 4 }).toBuffer({ resolveWithObject: true });
    if (data.length > GIF_MOTION_MAX_BYTES) return null;
    pipeline = { data, width: info.width, height: info.pageHeight ?? info.height };
    mimeType = "image/webp";
  } else if (kind === "MOTION" && asset.mimeType === "video/mp4") {
    if (!(await ffmpegAvailable())) return null;
    const data = await videoClip(asset.fileData);
    const meta = await sharp(await videoFrame(data)).metadata().catch(() => ({}));
    pipeline = { data, width: meta.width ?? null, height: meta.height ?? null };
    mimeType = "video/mp4";
  } else return null;
  if (pipeline.data.length > PREVIEW_MAX_BYTES) return null;
  assertNotOriginal(asset, pipeline.data);
  return { kind, mimeType, data: pipeline.data, width: pipeline.width, height: pipeline.height, size: pipeline.data.length, sourceVersion: previewSourceVersion(asset, kind) };
}

const assetSelect = { id: true, publicId: true, mimeType: true, mediaVersion: true, posterMediaVersion: true, fileData: true, posterFileData: true };

async function generate(db, assetRow, kind) {
  const asset = assetRow.fileData ? assetRow : await db.uploadAsset.findUnique({ where: { id: assetRow.id }, select: assetSelect });
  if (!asset) return null;
  const built = await buildPreview(asset, kind);
  if (!built) return null;
  const data = { mimeType: built.mimeType, data: built.data, storageKey: null, sourceVersion: built.sourceVersion, width: built.width, height: built.height, size: built.size };
  return db.assetPreview.upsert({ where: { assetId_kind: { assetId: asset.id, kind } }, create: { assetId: asset.id, kind, ...data }, update: data });
}

async function acquireSlot() {
  if (jobState.active < MAX_ACTIVE_JOBS) { jobState.active += 1; return; }
  if (jobState.queue.length >= MAX_QUEUED_JOBS) throw new PartnerApiError("PREVIEW_BUSY", "Preview generation is busy. Try again shortly.", 503, { "Retry-After": "10" });
  await new Promise((resolve) => jobState.queue.push(resolve));
}

function releaseSlot() {
  const next = jobState.queue.shift();
  if (next) next(); else jobState.active -= 1;
}

export function resetPreviewJobs() { failures.clear(); jobState.active = 0; jobState.queue.length = 0; }

export async function ensurePreview(db, asset, kind, { force = false } = {}) {
  const version = previewSourceVersion(asset, kind);
  const existing = await db.assetPreview.findUnique({ where: { assetId_kind: { assetId: asset.id, kind } } });
  if (!force && existing?.data && existing.sourceVersion === version) return existing;
  const lockKey = `${asset.id}:${kind}`;
  const failureKey = `${lockKey}:${version}`;
  if (!force && (failures.get(failureKey) ?? 0) > Date.now()) return null;
  if (locks.has(lockKey)) return locks.get(lockKey);
  const job = (async () => {
    await acquireSlot();
    let result = null;
    try { result = await generate(db, asset, kind); }
    catch (error) { console.error("Partner preview failed", { asset: asset.publicId, kind, message: error.message }); }
    finally { releaseSlot(); }
    if (!result) {
      failures.set(failureKey, Date.now() + FAILURE_TTL_MS);
      if (failures.size > 5000) failures.delete(failures.keys().next().value);
    }
    return result;
  })().finally(() => locks.delete(lockKey));
  locks.set(lockKey, job);
  return job;
}

export const partnerPreviewAssetSelect = assetSelect;
