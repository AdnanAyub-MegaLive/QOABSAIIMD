import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { ffmpegAvailable, ffmpegPath } from "./partner-previews.js";

export const MOV_MIME = "video/quicktime";
const MOV_ATOMS = new Set(["ftyp", "moov", "mdat", "wide", "free", "skip", "pnot"]);

export function isMovFile(file) {
  return file?.type === MOV_MIME || /\.mov$/i.test(String(file?.name ?? ""));
}

export function looksLikeMov(bytes) {
  if (!bytes || bytes.length < 12) return false;
  const atom = bytes.subarray(4, 8).toString("latin1");
  return MOV_ATOMS.has(atom);
}

export function mp4FileName(name) {
  const base = String(name ?? "video").replace(/\.mov$/i, "") || "video";
  return `${base}.mp4`.slice(-255);
}

export function movConversionArgs(input, output) {
  return ["-v", "error", "-protocol_whitelist", "file", "-i", input,
    "-map", "0:v:0", "-map", "0:a:0?", "-map_metadata", "-1", "-map_chapters", "-1",
    "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2", "-fps_mode", "passthrough",
    "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", "-threads", "2", "-y", output];
}

function conversionError(code, message, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

export async function convertMovToMp4(bytes, { exec = promisify(execFile), available = ffmpegAvailable } = {}) {
  if (!looksLikeMov(bytes)) throw conversionError("UNSUPPORTED_MEDIA_TYPE", "This .mov file is not a valid QuickTime video.", 415);
  if (!(await available())) throw conversionError("FFMPEG_UNAVAILABLE", "MOV needs ffmpeg on the server. Upload an MP4 instead.", 503);
  const dir = await mkdtemp(join(tmpdir(), "mov-convert-"));
  try {
    const input = join(dir, "in.mov"), output = join(dir, "out.mp4");
    await writeFile(input, bytes);
    try {
      await exec(ffmpegPath(), movConversionArgs(input, output), { timeout: 180000, maxBuffer: 1024 * 1024, windowsHide: true });
    } catch {
      throw conversionError("UNSUPPORTED_MEDIA_TYPE", "This .mov file could not be converted. Make sure it contains a video track.", 415);
    }
    const converted = await readFile(output);
    if (!converted.length) throw conversionError("UNSUPPORTED_MEDIA_TYPE", "This .mov file could not be converted. Make sure it contains a video track.", 415);
    return converted;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
