import { auth } from "../../../../../../../auth";
import { prisma } from "@/lib/prisma";
import mobileSession from "@/lib/mobile-session.cjs";
import { assertMobileSession } from "@/lib/mobile-session-state";

export async function GET(request, { params }) {
  const { requestId: encoded } = await params;
  const item = await prisma.customRoomBackgroundRequest.findUnique({ where: { publicId: decodeURIComponent(encoded) }, select: { userId: true, fileData: true, fileName: true, mimeType: true } });
  if (!item) return Response.json({ success: false, error: { code: "CUSTOM_BACKGROUND_NOT_FOUND", message: "Custom background not found." } }, { status: 404 });
  let allowed = false;
  const session = await auth();
  if (session?.user?.email) allowed = Boolean(await prisma.admin.findFirst({ where: { email: session.user.email.toLowerCase(), active: true }, select: { id: true } }));
  if (!allowed) {
    try {
      const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
      const payload = mobileSession.verifyMobileSessionToken(token);
      const user = await prisma.user.findUnique({ where: { publicId: payload.userId }, select: { id: true, deletedAt: true, status: true, sessionVersion: true, forcedLogoutAt: true } });
      assertMobileSession(user, payload);
      allowed = user.id === item.userId;
    } catch { allowed = false; }
  }
  if (!allowed) return Response.json({ success: false, error: { code: "FORBIDDEN", message: "You cannot view this submission." } }, { status: 403 });
  return new Response(item.fileData, { headers: { "Content-Type": item.mimeType, "Content-Length": String(item.fileData.byteLength), "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(item.fileName)}`, "Cache-Control": "private, max-age=300" } });
}
