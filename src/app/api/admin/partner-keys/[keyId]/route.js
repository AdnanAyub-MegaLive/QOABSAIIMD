import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/portal-admin";
import { sameOrigin, jsonBody } from "@/lib/game-control/http";
import { revokePartnerKey, updatePartnerKeyOrigins } from "@/lib/partner-keys";
import { clearPartnerKeyCache } from "@/lib/partner-auth";

export const dynamic = "force-dynamic";

const failure = (e) => {
  if (!e.status) console.error("Partner key admin failed", e);
  return Response.json({ success: false, error: { code: e.code ?? "REQUEST_FAILED", message: e.status ? e.message : "Unable to update partner key." } }, { status: e.status ?? 500, headers: { "Cache-Control": "no-store" } });
};

export async function PATCH(request, { params }) {
  try {
    sameOrigin(request);
    const admin = await requirePermission("uploads.manage");
    const { keyId } = await params;
    const data = await updatePartnerKeyOrigins(prisma, admin, keyId, await jsonBody(request));
    clearPartnerKeyCache();
    return Response.json({ success: true, data }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return failure(e); }
}

export async function DELETE(request, { params }) {
  try {
    sameOrigin(request);
    const admin = await requirePermission("uploads.manage");
    const { keyId } = await params;
    const data = await revokePartnerKey(prisma, admin, keyId);
    clearPartnerKeyCache();
    return Response.json({ success: true, data }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return failure(e); }
}
