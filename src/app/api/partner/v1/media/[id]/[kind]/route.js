import { prisma } from "@/lib/prisma";
import { createPartnerHandlers } from "@/lib/partner-api-handlers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request, { params }) {
  const { id, kind } = await params;
  return createPartnerHandlers(prisma).media(request, id, kind);
}
