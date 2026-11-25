import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/portal-admin";
import { sameOrigin, jsonBody } from "@/lib/game-control/http";
import { createPartnerKey, listPartnerKeys } from "@/lib/partner-keys";

export const dynamic = "force-dynamic";

const failure = (e) => {
  if (!e.status) console.error("Partner key admin failed", e);
  return Response.json({ success: false, error: { code: e.code ?? "REQUEST_FAILED", message: e.status ? e.message : "Unable to process partner keys." } }, { status: e.status ?? 500, headers: { "Cache-Control": "no-store" } });
};

export async function GET() {
  try {
    await requirePermission("uploads.manage");
    return Response.json({ success: true, data: await listPartnerKeys(prisma) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) { return failure(e); }
}

export async function POST(request) {
  try {
    sameOrigin(request);
    const admin = await requirePermission("uploads.manage");
    const result = await createPartnerKey(prisma, admin, await jsonBody(request));
    return Response.json({ success: true, data: result }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (e) { return failure(e); }
}
