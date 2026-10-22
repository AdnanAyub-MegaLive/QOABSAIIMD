import { requirePortalAdmin } from "@/lib/portal-admin";
import { isDatabaseOwner } from '@/lib/database-management-access';
export async function GET() {
  const admin = await requirePortalAdmin();
  return Response.json({ success: Boolean(admin), data: admin ? {...admin,databaseOwner:isDatabaseOwner(admin)} : null }, { status: admin ? 200 : 401, headers: { "Cache-Control": "no-store" } });
}
