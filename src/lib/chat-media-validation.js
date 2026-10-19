import sharp from "sharp";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CHAT_MEDIA_LIMITS as limits, chatError } from "./chat-media.js";
const exec = promisify(execFile);
export async function decodeChatPicture(bytes, mimeType) {
  if (!bytes.length || bytes.length > limits.pictureBytes) throw chatError("FILE_TOO_LARGE", "Pictures must be at most 10 MB.");
  const expected = { "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" }[mimeType];
  if (!expected) throw chatError("VALIDATION_ERROR", "Use JPEG, PNG, WebP or GIF.");
  try {
    const options = { animated: true, limitInputPixels: 25000000, failOn: "warning" };
    const metadata = await sharp(bytes, options).metadata();
    if (metadata.format !== expected || (metadata.pages ?? 1) > 200) throw Error("Invalid picture");
    // Decode and encode all frames; strip metadata/trailing payloads without flattening animation.
    const { data, info } = await sharp(bytes, options).resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer({ resolveWithObject: true });
    if (data.length > limits.pictureBytes) throw Error("Encoded picture exceeds limit");
    return { bytes: data, kind: "picture", mimeType: "image/webp", width: info.width, height: info.pageHeight ?? info.height / (info.pages || 1), durationMs: null };
  } catch { throw chatError("VALIDATION_ERROR", "Invalid or overly complex image. Use up to 200 frames and 25 million decoded pixels."); }
}
export async function decodeChatVideo(bytes, mimeType) {
  if (!bytes.length || bytes.length > limits.videoBytes) throw chatError("FILE_TOO_LARGE", "Videos must be at most 50 MB.");
  if (mimeType !== "video/mp4") throw chatError("VALIDATION_ERROR", "Use an H.264 MP4 with optional AAC audio.");
  const dir = await mkdtemp(join(tmpdir(), "mega-chat-video-"));
  const input = join(dir, "input.mp4"), output = join(dir, "output.mp4"), poster = join(dir, "poster.jpg");
  try {
    await writeFile(input, bytes);
    const { stdout } = await exec(process.env.FFPROBE_PATH || "ffprobe", ["-v", "error", "-protocol_whitelist", "file", "-show_streams", "-show_format", "-of", "json", input], { timeout: 15000, maxBuffer: 256 * 1024, windowsHide: true });
    const info = JSON.parse(stdout), streams = info.streams ?? [], videos = streams.filter(s => s.codec_type === "video"), seconds = Number(info.format?.duration);
    if (!info.format?.format_name?.split(",").includes("mp4") || videos.length !== 1 || streams.length > 2 || videos[0].codec_name !== "h264" || videos[0].width > 3840 || videos[0].height > 3840 || !Number.isFinite(seconds) || seconds <= 0 || seconds > 60 || streams.some(s => s.codec_type !== "video" && (s.codec_type !== "audio" || s.codec_name !== "aac"))) throw Error("Invalid streams");
    // Full decode/re-encode rejects corruption and excludes attachments, metadata and arbitrary tracks.
    await exec(process.env.FFMPEG_PATH || "ffmpeg", ["-v", "error", "-xerror", "-protocol_whitelist", "file", "-i", input, "-map", "0:v:0", "-map", "0:a:0?", "-map_metadata", "-1", "-map_chapters", "-1", "-vf", "scale=w='min(1280,iw)':h='min(1280,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2", "-c:v", "libx264", "-preset", "veryfast", "-crf", "24", "-pix_fmt", "yuv420p", "-threads", "2", "-c:a", "aac", "-movflags", "+faststart", output], { timeout: 120000, maxBuffer: 256 * 1024, windowsHide: true });
    await exec(process.env.FFMPEG_PATH || "ffmpeg", ["-v", "error", "-protocol_whitelist", "file", "-i", output, "-frames:v", "1", "-vf", "scale=480:-2", poster], { timeout: 15000, maxBuffer: 256 * 1024, windowsHide: true });
    const data = await readFile(output), posterBytes = await readFile(poster);
    if (data.length > limits.videoBytes) throw Error("Encoded video exceeds limit");
    const { stdout: probe } = await exec(process.env.FFPROBE_PATH || "ffprobe", ["-v", "error", "-show_streams", "-of", "json", output], { timeout: 15000, maxBuffer: 256 * 1024, windowsHide: true });
    const video = JSON.parse(probe).streams.find(s => s.codec_type === "video");
    return { bytes: data, posterBytes, kind: "video", mimeType: "video/mp4", width: video.width, height: video.height, durationMs: Math.round(seconds * 1000) };
  } catch (error) {
    if (error.code === "ENOENT") throw chatError("CHAT_STORAGE_UNAVAILABLE", "Video processing requires ffmpeg and ffprobe on the server.");
    throw chatError("VALIDATION_ERROR", "Use a valid H.264/AAC MP4 up to 60 seconds and 3840 pixels.");
  } finally { await rm(dir, { recursive: true, force: true }); }
}
export async function readChatMultipart(request) {
  const reader = request.body?.getReader();
  if (!reader) throw chatError("VALIDATION_ERROR", "Provide a multipart file upload.");
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length;
      if (size > limits.videoBytes + 65536) { await reader.cancel(); throw chatError("FILE_TOO_LARGE", "Upload exceeds 50 MB."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try { return await new Response(Buffer.concat(chunks), { headers: { "content-type": request.headers.get("content-type") ?? "" } }).formData(); }
  catch { throw chatError("VALIDATION_ERROR", "Provide a multipart file upload."); }
}
