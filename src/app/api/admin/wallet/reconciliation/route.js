import { portalPermissionError } from "@/lib/portal-admin";
import { prisma } from "@/lib/prisma";
import { requireFinanceAdmin } from "@/lib/portal-admin";
import { readWalletReconciliation } from "@/lib/wallet-reconciliation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

export async function GET(request) {
  const permissionDenied = await portalPermissionError("finance.view");
  if (permissionDenied) return permissionDenied;

  const admin = await requireFinanceAdmin();
  if (!admin)
    return json({ success: false, error: { code: "UNAUTHORIZED", message: "Finance administrator access is required." } }, 401);

  const requestedUserId = new URL(request.url).searchParams.get("userId")?.trim();
  const reconciliations = await readWalletReconciliation(prisma, requestedUserId || null);
  if (requestedUserId && !reconciliations.length)
    return json({ success: false, error: { code: "USER_NOT_FOUND", message: "User not found." } }, 404);

  const matched = reconciliations.filter((item) => item.status === "MATCHED").length;

  return json({
    success: true,
    data: {
      reconciliations,
      summary: {
        usersChecked: reconciliations.length,
        matched,
        requiresBaselineOrInvestigation: reconciliations.length - matched,
      },
    },
  });
}
