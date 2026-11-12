import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { mobileApiError, mobileJson, mobileOptions, requireMobileUser } from "@/lib/mobile-api";
import { kycIdentity, readKyc, submitKyc, validateKycFields } from "@/lib/host-kyc";
import { videoError } from "@/lib/video-access";
export function OPTIONS() { return mobileOptions(); }
export async function GET(request) {
  try { const user = await requireMobileUser(request); return mobileJson({ success: true, data: await readKyc(prisma, user) }); }
  catch (e) { return mobileApiError(e, "KYC_READ_FAILED"); }
}
export async function POST(request) {
  try {
    const user = await requireMobileUser(request), max = 31 * 1024 * 1024;
    const identity = await kycIdentity(prisma, user);
    if (!identity.talent && user.role !== "HOST" && !user.appRoles?.includes("HOST")) throw videoError("KYC_HOST_REQUIRED", "Only hosts may submit verification.");
    if (user.isVerified) throw videoError("KYC_ALREADY_VERIFIED", "Your account is already verified.", 409);
    if (await prisma.talentVerification.findFirst({ where: { ...identity.where, status: "PENDING" } })) throw videoError("KYC_PENDING", "Your verification is already under review.", 409);
    if (await prisma.talentVerification.count({ where: { ...identity.where, submittedAt: { gt: new Date(Date.now() - 86400000) } } }) >= 3) throw videoError("KYC_RATE_LIMITED", "You can submit verification up to three times per day.", 429);
    if (!request.body || !request.headers.get("content-type")?.startsWith("multipart/form-data;") || Number(request.headers.get("content-length")) > max) throw videoError("VALIDATION_ERROR", "Send document photos as multipart form data, up to 10 MB each.", 422);
    const reader = request.body.getReader(), parts = []; let size = 0;
    try { while (true) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > max) { await reader.cancel(); throw videoError("VALIDATION_ERROR", "Upload is too large.", 413); } parts.push(value); } } finally { reader.releaseLock(); }
    const form = await new Response(Buffer.concat(parts), { headers: { "Content-Type": request.headers.get("content-type") } }).formData();
    const fields = validateKycFields(form.get("legalName"), form.get("idType")), images = {};
    for (const [input, output] of [["identityCardFront", "identityCardFront"], ["identityCardBack", "identityCardBack"], ["selfie", "profileImage"]]) {
      const file = form.get(input);
      if (!file && input === "identityCardBack" && fields.idType === "PASSPORT") continue;
      if (!(file instanceof File) || !file.size || file.size > 10 * 1024 * 1024 || form.getAll(input).length !== 1) throw videoError("VALIDATION_ERROR", `${input} must be one JPEG, PNG or WebP image up to 10 MB.`, 422);
      try {
        const image = sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 25000000 });
        if (!["jpeg", "png", "webp"].includes((await image.metadata()).format)) throw new Error();
        images[output] = await image.rotate().resize(2048, 2048, { fit: "inside", withoutEnlargement: true }).webp({ quality: 90 }).toBuffer();
      } catch { throw videoError("VALIDATION_ERROR", `${input} is not a valid JPEG, PNG or WebP image.`, 422); }
    }
    return mobileJson({ success: true, data: await submitKyc(prisma, user.id, fields, images) }, 201);
  } catch (e) { return mobileApiError(e, "KYC_SUBMIT_FAILED"); }
}
