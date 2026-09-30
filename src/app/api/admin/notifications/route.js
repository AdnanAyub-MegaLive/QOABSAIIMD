import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { requirePortalAdmin } from "@/lib/portal-admin";

export async function GET() {
  const admin = await requirePortalAdmin();
  if (!admin) return Response.json({ success: false, error: { code: "UNAUTHORIZED", message: "Administrator access is required." } }, { status: 401 });
  const rows = await prisma.notification.findMany({ include: { user: { select: { publicId: true, name: true } }, _count: { select: { reads: true } } }, orderBy: { createdAt: "desc" }, take: 200 });
  return Response.json({ success: true, data: { notifications: rows.map((row) => ({ id: row.publicId, title: row.title, body: row.body, target: row.user, readCount: row._count.reads, createdAt: row.createdAt.toISOString() })) } });
}

export async function POST(request) {
  const admin = await requirePortalAdmin();
  if (!admin) return Response.json({ success: false, error: { code: "UNAUTHORIZED", message: "Administrator access is required." } }, { status: 401 });
  const body = await request.json();
  const title = String(body?.title ?? "").trim();
  const message = String(body?.body ?? "").trim();
  const targetPublicId = String(body?.userId ?? "").trim() || null;
  if (!title || title.length > 120 || !message || message.length > 2000) return Response.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Title must contain 1 to 120 characters and body 1 to 2000 characters." } }, { status: 422 });
  const target = targetPublicId ? await prisma.user.findFirst({ where: { publicId: targetPublicId, deletedAt: null }, select: { id: true, publicId: true, name: true } }) : null;
  if (targetPublicId && !target) return Response.json({ success: false, error: { code: "USER_NOT_FOUND", message: "User not found." } }, { status: 404 });
  const notification = await prisma.notification.create({ data: { publicId: `NOT-${crypto.randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase()}`, userId: target?.id ?? null, title, body: message } });
  const data = { id: notification.publicId, title, body: message, target: target ? { publicId: target.publicId, name: target.name } : null, readCount: 0, createdAt: notification.createdAt.toISOString() };
  if (target) globalThis.portalIo?.to(`user:${target.publicId}`).emit("notification:new", data); else globalThis.portalIo?.emit("notification:new", data);
  return Response.json({ success: true, data: { notification: data } }, { status: 201 });
}
