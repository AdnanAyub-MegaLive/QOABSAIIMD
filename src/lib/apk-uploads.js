import { Open } from "unzipper";

export const APK_MAX_BYTES = 250 * 1024 * 1024;
export const APK_MIME = "application/vnd.android.package-archive";
export function apkError(message, status = 422) {
  return Object.assign(new Error(message), { status, code: "APK_UPLOAD_INVALID" });
}
export async function validateApk(file) {
  if (!file || typeof file.arrayBuffer !== "function" || !/\.apk$/i.test(file.name)) throw apkError("Select an Android .apk file.");
  if (!file.size || file.size > APK_MAX_BYTES) throw apkError("APK files must be between 1 byte and 250 MB.", 413);
  const bytes = Buffer.from(await file.arrayBuffer());
  try {
    const archive = await Open.buffer(bytes);
    if (archive.files.length > 50000) throw new Error();
    const manifest = archive.files.find(entry => entry.path === "AndroidManifest.xml");
    if (!manifest || manifest.type !== "File" || !manifest.uncompressedSize) throw new Error();
    if (archive.files.some(entry => entry.flags & 1)) throw new Error();
  } catch {
    throw apkError("Invalid APK: expected an unencrypted ZIP package containing AndroidManifest.xml.");
  }
  return bytes;
}
export function apkDto(asset) {
  return { id: asset.publicId, name: asset.name, fileSize: asset.fileSize, active: asset.active, createdAt: asset.createdAt, downloadPath: `/api/apk-downloads/${asset.publicId}` };
}
