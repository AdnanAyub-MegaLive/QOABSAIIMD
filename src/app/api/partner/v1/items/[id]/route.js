import { prisma } from "@/lib/prisma";
import { createPartnerHandlers } from "@/lib/partner-api-handlers";

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  const { id } = await params;
  return createPartnerHandlers(prisma).getItem(request, id);
}
