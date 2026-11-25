import { prisma } from "@/lib/prisma";
import { createPartnerHandlers } from "@/lib/partner-api-handlers";

export const dynamic = "force-dynamic";

export function GET(request) {
  return createPartnerHandlers(prisma).listItems(request);
}
