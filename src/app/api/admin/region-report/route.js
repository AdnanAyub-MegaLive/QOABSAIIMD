import { requirePermission } from "@/lib/portal-admin";
import { prisma } from "@/lib/prisma";
import { regionReport } from "@/lib/region-report";

export const dynamic = "force-dynamic";
export async function GET(request) {
  try {
    const admin = await requirePermission("region.view");
    const url = new URL(request.url);
    const report = await regionReport(prisma, admin, { days: url.searchParams.get("days") });
    if (url.searchParams.get("format") !== "csv") return Response.json({ success: true, data: report });
    const keys = Object.keys(report.totals);
    const lines = [keys.join(","), ...[...report.rows, report.totals].map(r => keys.map(k => `"${String(r[k]).replaceAll('"', '""')}"`).join(","))];
    return new Response(lines.join("\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="region-report-${report.days}d.csv"`, "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ success: false, error: { code: error.code ?? "FAILED", message: error.status ? error.message : "Unable to build the report." } }, { status: error.status ?? 500 });
  }
}
