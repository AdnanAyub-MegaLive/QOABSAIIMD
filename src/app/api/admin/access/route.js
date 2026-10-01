import { requirePortalAdmin } from "@/lib/portal-admin";
export async function GET() {
  const admin = await requirePortalAdmin();
  return Response.json({ success: Boolean(admin), data: admin }, { status: admin ? 200 : 401, headers: { "Cache-Control": "no-store" } });
}
