import { approvedSuperAdminDevice } from "../../../../lib/super-admin-device.js";

export async function GET(request) {
  return Response.json({
    enabled: process.env.SUPER_ADMIN_MTLS_ENABLED === "true",
    approvedDevice: approvedSuperAdminDevice(request.headers),
  }, { headers: { "Cache-Control": "no-store" } });
}
