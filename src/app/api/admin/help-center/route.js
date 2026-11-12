import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/portal-admin";
import { sameOrigin } from "@/lib/game-control/http";
import { mutateHelp, helpDefaults } from "@/lib/help-center";
const errorResponse = error => Response.json({ success: false, error: { message: error.issues ? error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ") : error.code === "P2002" ? "This slug already exists in that language." : error.status ? error.message : "Unable to update Help Center." } }, { status: error.issues ? 422 : error.code === "P2002" ? 409 : error.status || 500 });
export async function GET() {
  try {
    await requirePermission("help_center.manage");
    const [entries, settings] = await Promise.all([prisma.helpEntry.findMany({ orderBy: [{ sortOrder: "asc" }, { slug: "asc" }] }), prisma.helpSettings.findUnique({ where: { id: "GLOBAL" } })]);
    return Response.json({ success: true, data: { entries, settings: settings || helpDefaults } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
export async function POST(request) {
  try {
    const admin = await requirePermission("help_center.manage"); sameOrigin(request);
    const raw = await request.text();
    if (raw.length > 150000) throw Object.assign(new Error("Help entry is too large."), { status: 413 });
    let input; try { input = JSON.parse(raw); } catch { throw Object.assign(new Error("Invalid JSON."), { status: 400 }); }
    if (!input || typeof input !== "object") throw Object.assign(new Error("Provide a Help Center action."), { status: 422 });
    return Response.json({ success: true, data: await mutateHelp(prisma, admin, input) });
  } catch (error) { return errorResponse(error); }
}
