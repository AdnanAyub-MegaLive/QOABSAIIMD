import { prisma } from "@/lib/prisma";
export async function GET(_request, { params }) {
  const { id } = await params;
  const icon = await prisma.helpIcon.findUnique({ where: { id } });
  if (!icon) return new Response(null, { status: 404 });
  return new Response(icon.data, { headers: { "Content-Type": "image/webp", "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff", "Access-Control-Allow-Origin": "*" } });
}
