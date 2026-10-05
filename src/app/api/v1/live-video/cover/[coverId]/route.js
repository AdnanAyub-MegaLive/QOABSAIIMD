import { prisma } from "@/lib/prisma";
export async function GET(request, { params }) {
  const { coverId } = await params;
  const cover = await prisma.videoLiveCover.findUnique({ where: { id: coverId }, select: { data: true } });
  if (!cover) return new Response(null, { status: 404 });
  return new Response(cover.data, { headers: { "Content-Type": "image/webp", "X-Content-Type-Options": "nosniff", "Cache-Control": "public, max-age=86400" } });
}
