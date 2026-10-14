import { portalPermissionError } from "@/lib/portal-admin";
import { prisma } from "@/lib/prisma";
import { requirePortalAdmin } from "@/lib/portal-admin";
import {notifyAction} from "@/lib/action-notifications";
import {sameOrigin} from "@/lib/game-control/http";
import {customBackgroundReasons} from "@/lib/custom-background-reasons";

export async function PATCH(request, { params }) {
  const permissionDenied = await portalPermissionError("appearance.manage");
  if (permissionDenied) return permissionDenied;

  const actor = await requirePortalAdmin();
  if (!actor) return Response.json({ success: false, error: { code: "UNAUTHORIZED", message: "Administrator access is required." } }, { status: 401 });
  try {
    sameOrigin(request);
    const { requestId: encoded } = await params; const body = await request.json(); const action = String(body.action ?? "").toUpperCase(); const reasonCode = String(body.reason ?? "").trim(); const note=String(body.note??"").trim().slice(0,500);const reason=reasonCode+(note?`: ${note}`:"");
    if (!["APPROVE", "REJECT"].includes(action)) throw Object.assign(new Error("Action must be APPROVE or REJECT."), { status: 422 });
    if (action === "REJECT" && !customBackgroundReasons.includes(reasonCode)) throw Object.assign(new Error("Select a valid rejection reason."), { status: 422 });
    const publicId = decodeURIComponent(encoded);
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "CustomRoomBackgroundRequest" WHERE "publicId" = ${publicId} FOR UPDATE`;
      const item = await tx.customRoomBackgroundRequest.findUnique({ where: { publicId }, include: { user: { select: { publicId: true } } } });
      if (!item) throw Object.assign(new Error("Submission not found."), { status: 404 });
      if (item.status !== "PENDING") throw Object.assign(new Error("This submission has already been reviewed."), { status: 409 });
      if (action === "APPROVE") {
        const user=await tx.user.findFirst({where:{id:item.userId,deletedAt:null,status:"ACTIVE"}});
        const ban=await tx.ban.findFirst({where:{userId:item.userId,revokedAt:null,startsAt:{lte:new Date()},OR:[{expiresAt:null},{expiresAt:{gt:new Date()}}]}});
        if(!user||ban||Date.now()-item.submittedAt.getTime()>=72*3600000)throw Object.assign(new Error("The account or request is no longer eligible for approval; automatic refund is pending."),{status:409});
        const assetPublicId = `AST-${crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`; const expiresAt = new Date(Date.now() + item.durationDays * 86400000);
        const asset = await tx.uploadAsset.create({ data: { publicId: assetPublicId, name: `Custom background · ${item.user.publicId}`, details: `Approved custom room background ${item.publicId}`, category: "ROOM_BACKGROUNDS", fileName: item.fileName, mimeType: item.mimeType, fileSize: item.fileSize, fileData: item.fileData, isGlobal: false, isRoomBackground: true, distribution: "MANUAL", active: true } });
        await tx.uploadAssetAssignment.create({ data: { assetId: asset.id, userId: item.userId, durationMinutes: item.durationDays * 1440, expiresAt, source: "CUSTOM_BACKGROUND", sourceReference: item.publicId, purchasePrice: item.coins } });
        await tx.customRoomBackgroundRequest.update({ where: { id: item.id }, data: { status: "APPROVED", reviewedAt: new Date(), reviewedByAdminId: actor.id, approvedAssetId: asset.id, rejectionReason: null } });
      } else {
        await tx.user.update({ where: { id: item.userId }, data: { coinBalance: { increment: item.coins } } });
        await tx.walletTransaction.create({ data: { publicId: `WTX-${crypto.randomUUID()}`, userId: item.userId, type: "CUSTOM_BACKGROUND_REFUND", direction: "CREDIT", title: "Custom background refund", description: reason, coins: item.coins, referenceId: item.publicId } });
        await tx.customRoomBackgroundRequest.update({ where: { id: item.id }, data: { status: "REJECTED", reviewedAt: new Date(), reviewedByAdminId: actor.id, rejectionReason: reason } });
      }
      await tx.auditLog.create({ data: { adminId: actor.id, action: `CUSTOM_BACKGROUND_${action}D`, category: "CONTENT_MANAGEMENT", entityType: "CustomRoomBackgroundRequest", entityId: publicId, description: `${actor.name} ${action === "APPROVE" ? "approved" : "rejected"} custom background ${publicId}.`, metadata: { reason: reason || null } } });
      await notifyAction(tx,{userId:item.userId,key:`custom-background:${item.id}:reviewed`,type:"CUSTOM_BACKGROUND",title:action==="APPROVE"?"Background approved":"Background rejected",body:action==="APPROVE"?"Your custom background is ready. Apply it to your room.":`${reason}. ${item.coins} coins have been refunded.`,action:{screen:"ROOM_THEME"}});
    });
    return Response.json({ success: true, data: { id: publicId, status: action === "APPROVE" ? "APPROVED" : "REJECTED" } });
  } catch (error) { const status = error.status ?? 500; if (status === 500) console.error("Custom background review failed", error); return Response.json({ success: false, error: { code: status === 422 ? "VALIDATION_ERROR" : status === 404 ? "NOT_FOUND" : status === 409 ? "ALREADY_REVIEWED" : "CUSTOM_BACKGROUND_REVIEW_FAILED", message: status === 500 ? "Unable to review this submission." : error.message } }, { status }); }
}
