import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/portal-admin";
import { financeRecords } from "@/lib/finance-records";
export async function GET(request) {
  try {
    await requirePermission("finance.view");
    return Response.json({ success: true, data: await financeRecords(prisma, new URL(request.url).searchParams) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return Response.json({ success: false, error: { code: error.status ? error.code : "FINANCE_READ_FAILED", message: error.status ? error.message : "Unable to load finance records." } }, { status: error.status ?? 500, headers: { "Cache-Control": "private, no-store" } });
  }
}
