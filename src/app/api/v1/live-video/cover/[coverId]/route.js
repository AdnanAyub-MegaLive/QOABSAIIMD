import { prisma } from "@/lib/prisma";
export async function GET(request, { params }) {
  const { coverId } = await params;
  const cover = await prisma.videoLiveCover.findUnique({ where: { id: coverId }, select: { data: true } });
  if (!cover) return new Response(null, { status: 404 });
  const mime=["GIF87a","GIF89a"].includes(Buffer.from(cover.data).subarray(0,6).toString("ascii"))?"image/gif":"image/webp";
  return new Response(cover.data, { headers: { "Content-Type": mime, "X-Content-Type-Options": "nosniff", "Cache-Control": "public, max-age=86400" } });
}
