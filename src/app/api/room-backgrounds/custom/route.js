import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";
import { readBoundedMultipart } from "@/lib/bounded-multipart";
import {validateCoverVideo} from "@/lib/profile-cover-video";
import {notifyAction} from "@/lib/action-notifications";
import { prisma } from "@/lib/prisma";
import { customBackgroundInclude, getCustomBackgroundConfiguration, serializeCustomBackgroundRequest } from "@/lib/custom-room-backgrounds";
import { mobileApiError, mobileJson, mobileOptions, requireMobileUser } from "@/lib/mobile-api";
import { requestOrigin } from "@/lib/user-perks";

export function OPTIONS() { return mobileOptions(); }

export async function GET(request) {
  try {
    const user = await requireMobileUser(request);
    const items = await prisma.customRoomBackgroundRequest.findMany({ where: { userId: user.id }, include: customBackgroundInclude(user.id), orderBy: { submittedAt: "desc" }, take: 100 });
    return mobileJson({ success: true, data: { requests: items.map((item) => serializeCustomBackgroundRequest(item, requestOrigin(request))) } });
  } catch (error) { return mobileApiError(error, "CUSTOM_BACKGROUND_LIST_FAILED"); }
}

export async function POST(request) {
  let authenticatedUser = null;
  let idempotencyKey = null;
  try {
    const user = await requireMobileUser(request);
    authenticatedUser = user;
    const config = await getCustomBackgroundConfiguration();
    const form = await readBoundedMultipart(request, config.settings.maxBytes);
    const priceId = String(form.get("priceId") ?? "").trim();
    const requestId = String(form.get("requestId") ?? request.headers.get("idempotency-key") ?? "").trim();
    idempotencyKey = requestId;
    const image = form.get("image") ?? form.get("video");
    if (!/^[A-Za-z0-9._:-]{8,128}$/.test(requestId)) throw Object.assign(new Error("A valid requestId is required."), { code: "VALIDATION_ERROR" });
    const existing = await prisma.customRoomBackgroundRequest.findUnique({ where: { userId_requestId: { userId: user.id, requestId } }, include: customBackgroundInclude(user.id) });
    if (existing) return mobileJson({ success: true, data: { request: serializeCustomBackgroundRequest(existing, requestOrigin(request)) } });
    if (!(image instanceof File)) throw Object.assign(new Error("An image file is required."), { code: "VALIDATION_ERROR" });
    if (!config.settings.enabled) throw Object.assign(new Error("Custom background submissions are disabled."), { code: "CUSTOM_BACKGROUND_DISABLED" });
    const price = await prisma.customRoomBackgroundPrice.findFirst({ where: { id: priceId, active: true } });
    if (!price) throw Object.assign(new Error("The selected price package is unavailable."), { code: "CUSTOM_BACKGROUND_PRICE_INVALID" });
    if (image.size < 1 || image.size > config.settings.maxBytes) throw Object.assign(new Error(`Image must be no larger than ${config.settings.maxBytes} bytes.`), { code: "VALIDATION_ERROR" });
    const sourceBytes = Buffer.from(await image.arrayBuffer());
    const detected = await fileTypeFromBuffer(sourceBytes);
    if (!detected || detected.mime!==image.type || !config.settings.mimeTypes.includes(detected.mime)) throw Object.assign(new Error("The uploaded file type is not allowed or does not match its content."), { code: "CUSTOM_BACKGROUND_TYPE_INVALID" });
    let bytes;
    try {
      if(detected.mime==="video/mp4"){
        if(sourceBytes.length>20*1024*1024)throw new Error("Video too large");
        await validateCoverVideo(sourceBytes,{noAudio:true});bytes=sourceBytes;
      }else if(detected.mime==="image/gif"){
        const image=sharp(sourceBytes,{animated:true,failOn:"error",limitInputPixels:25000000});
        if(((await image.metadata()).pages??1)>200)throw new Error("Too many animation frames");
        await image.stats();bytes=sourceBytes;
      }else bytes = await sharp(sourceBytes, { failOn: "error", limitInputPixels: 40_000_000 }).rotate().webp({ quality: 90, effort: 4 }).toBuffer();
    } catch {
      throw Object.assign(new Error("The image could not be decoded safely."), { code: "CUSTOM_BACKGROUND_TYPE_INVALID" });
    }
    if (bytes.length > config.settings.maxBytes) throw Object.assign(new Error(`Processed image must be no larger than ${config.settings.maxBytes} bytes.`), { code: "VALIDATION_ERROR" });
    const publicId = `CBG-${crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
    const created = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`;
      const eligible=await tx.user.findFirst({where:{id:user.id,deletedAt:null,status:"ACTIVE"}});
      const banned=await tx.ban.findFirst({where:{userId:user.id,revokedAt:null,startsAt:{lte:new Date()},OR:[{expiresAt:null},{expiresAt:{gt:new Date()}}]}});
      if(!eligible||banned)throw Object.assign(new Error("This account cannot submit a custom background."),{code:"ACCOUNT_BANNED"});
      const replay=await tx.customRoomBackgroundRequest.findUnique({where:{userId_requestId:{userId:user.id,requestId}},include:customBackgroundInclude(user.id)});
      if(replay)return replay;
      if(await tx.customRoomBackgroundRequest.count({where:{userId:user.id,status:"PENDING"}}))throw Object.assign(new Error("A background is already awaiting review."),{code:"CUSTOM_BACKGROUND_PENDING"});
      if(await tx.customRoomBackgroundRequest.count({where:{userId:user.id,submittedAt:{gte:new Date(Date.now()-86400000)}}})>=5)throw Object.assign(new Error("Only five submissions are allowed per 24 hours."),{code:"CUSTOM_BACKGROUND_DAILY_LIMIT"});
      const debited = await tx.user.updateMany({ where: { id: user.id, coinBalance: { gte: price.coins } }, data: { coinBalance: { decrement: price.coins } } });
      if (!debited.count) throw Object.assign(new Error("Your coin balance is too low."), { code: "INSUFFICIENT_COINS" });
      const mimeType=["image/gif","video/mp4"].includes(detected.mime)?detected.mime:"image/webp";
      const item = await tx.customRoomBackgroundRequest.create({ data: { publicId, requestId, userId: user.id, priceId: price.id, priceName: price.name, durationDays: price.durationDays, coins: price.coins, fileName: `${publicId}.${mimeType==="video/mp4"?"mp4":mimeType==="image/gif"?"gif":"webp"}`, mimeType, fileSize: bytes.length, fileData: bytes }, include: customBackgroundInclude(user.id) });
      await tx.walletTransaction.create({ data: { publicId: `WTX-${crypto.randomUUID()}`, userId: user.id, type: "CUSTOM_BACKGROUND_PURCHASE", direction: "DEBIT", title: "Custom room background", description: `${price.name} custom background review`, coins: price.coins, referenceId: publicId } });
      await notifyAction(tx,{userId:user.id,key:`custom-background:${item.id}:submitted`,type:"CUSTOM_BACKGROUND",title:"Background submitted",body:"Your custom background is under review.",action:{screen:"ROOM_THEME"}});
      return item;
    });
    return mobileJson({ success: true, data: { request: serializeCustomBackgroundRequest(created, requestOrigin(request)) } }, 201);
  } catch (error) {
    if (error?.code === "P2002" && authenticatedUser && idempotencyKey) {
      const existing = await prisma.customRoomBackgroundRequest.findUnique({ where: { userId_requestId: { userId: authenticatedUser.id, requestId: idempotencyKey } }, include: customBackgroundInclude(authenticatedUser.id) });
      if (existing) return mobileJson({ success: true, data: { request: serializeCustomBackgroundRequest(existing, requestOrigin(request)) } });
    }
    console.error("Custom background submission failed", error); return mobileApiError(error, "CUSTOM_BACKGROUND_SUBMIT_FAILED");
  }
}
