import { prisma } from "@/lib/prisma";
import { APK_MIME } from "@/lib/apk-uploads";

export const runtime = "nodejs";
export async function GET(_request, { params }) {
  const { id } = await params;
  const asset = await prisma.uploadAsset.findFirst({ where: { publicId: id, category: "APK", active: true }, select: { fileData: true, fileSize: true } });
  if (!asset) return new Response("Download unavailable.", { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(new Uint8Array(asset.fileData), { headers: {
    "Content-Type": APK_MIME, "Content-Length": String(asset.fileSize),
    "Content-Disposition": 'attachment; filename="MegaLive.apk"',
    "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store",
  } });
}
