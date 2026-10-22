import { portalPermissionError } from "@/lib/portal-admin";
import crypto from "node:crypto";
import { sameOrigin, jsonBody } from "@/lib/game-control/http";
import { prisma } from "@/lib/prisma";
import { requirePortalAdmin } from "@/lib/portal-admin";
import { retireCatalogItem } from "@/lib/catalog-retirement";

export async function GET(request) {
  const permissionDenied = await portalPermissionError("notifications.view");
  if (permissionDenied) return permissionDenied;

  const admin = await requirePortalAdmin();
  if (!admin) return Response.json({ success: false, error: { code: "UNAUTHORIZED", message: "Administrator access is required." } }, { status: 401 });
  const page = Math.max(1, Math.min(100000, Number(new URL(request.url).searchParams.get('page')) || 1));
  const rows = await prisma.notification.findMany({ include: { user: { select: { publicId: true, name: true } }, _count: { select: { reads: true } } }, orderBy: [{ createdAt: "desc" }, {id:"desc"}], skip:(Math.floor(page)-1)*50, take:51 });
  return Response.json({ success: true, data: { hasMore:rows.length>50, notifications: rows.slice(0,50).map((row) => ({ id: row.publicId, title: row.title, body: row.body, retractedAt:row.retractedAt?.toISOString()??null, target: row.user, readCount: row._count.reads, createdAt: row.createdAt.toISOString() })) } }, {headers:{'Cache-Control':'no-store'}});
}

export async function DELETE(request) {
  try {
    sameOrigin(request);
    const data = await retireCatalogItem(prisma, await requirePortalAdmin(), 'notification', await jsonBody(request));
    return Response.json({success:true,data});
  } catch(error) {
    if (!error.status) console.error('Notification retraction failed', error);
    return Response.json({success:false,error:{code:error.code??'NOTIFICATION_RETRACTION_FAILED',message:error.status?error.message:'Unable to retract this notification.'}},{status:error.status??500});
  }
}

export async function POST(request) {
  const permissionDenied = await portalPermissionError("notifications.manage");
  if (permissionDenied) return permissionDenied;

  const admin = await requirePortalAdmin();
  if (!admin) return Response.json({ success: false, error: { code: "UNAUTHORIZED", message: "Administrator access is required." } }, { status: 401 });
  let body;
  try { sameOrigin(request); body = await jsonBody(request); } catch(error) { return Response.json({success:false,error:{code:"INVALID_REQUEST",message:error.message}},{status:error.status||400}); }
  const type = body.type === "EVENT" ? "EVENT" : "SYSTEM";
  const title = String(body?.title ?? "").trim();
  const message = String(body?.body ?? "").trim();
  const targetPublicId = String(body?.userId ?? "").trim() || null;
  if (!title || title.length > 120 || !message || message.length > 2000) return Response.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Title must contain 1 to 120 characters and body 1 to 2000 characters." } }, { status: 422 });
  const target = targetPublicId ? await prisma.user.findFirst({ where: { publicId: targetPublicId, deletedAt: null }, select: { id: true, publicId: true, name: true } }) : null;
  if (targetPublicId && !target) return Response.json({ success: false, error: { code: "USER_NOT_FOUND", message: "User not found." } }, { status: 404 });
  const notification = await prisma.$transaction(async tx => {
    const record = await tx.notification.create({ data: { publicId: `NOT-${crypto.randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase()}`, userId: target?.id ?? null, title, body: message, type } });
    await tx.auditLog.create({data:{adminId:admin.id,action:"NOTIFICATION_PUBLISHED",category:"NOTIFICATIONS",entityType:"Notification",entityId:record.publicId,description:`Published ${type.toLowerCase()} notification.`}});
    return record;
  });
  const data = { id: notification.publicId, title, body: message, target: target ? { publicId: target.publicId, name: target.name } : null, readCount: 0, createdAt: notification.createdAt.toISOString() };
  return Response.json({ success: true, data: { notification: data } }, { status: 201 });
}
