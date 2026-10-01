import { portalPermissionError } from "@/lib/portal-admin";
import { auth } from "../../../../../../../auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

async function requirePortalAdmin() {
  const session = await auth();
  if (!session?.user?.email) return null;
  return prisma.admin.findFirst({
    where: { email: session.user.email, active: true },
    select: { id: true, name: true },
  });
}

export async function PATCH(request, { params }) {
  const permissionDenied = await portalPermissionError("users.verify");
  if (permissionDenied) return permissionDenied;

  const admin = await requirePortalAdmin();
  if (!admin)
    return json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Admin access is required." },
      },
      401,
    );
  let body;
  try {
    body = await request.json();
  } catch {
    return json(
      {
        success: false,
        error: { code: "INVALID_JSON", message: "Request body must be valid JSON." },
      },
      400,
    );
  }
  if (typeof body?.official !== "boolean")
    return json(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "official must be a boolean.",
        },
      },
      422,
    );

  const { id } = await params;
  const target = await prisma.user.findFirst({
    where: { deletedAt: null, OR: [{ id }, { publicId: id }] },
    select: { id: true, publicId: true, isOfficial: true, appRoles: true },
  });
  if (!target)
    return json(
      {
        success: false,
        error: { code: "USER_NOT_FOUND", message: "User not found." },
      },
      404,
    );

  const user = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: target.id },
      data: {
        isOfficial: body.official,
        appRoles: {
          set: body.official
            ? [...new Set([...target.appRoles, "OFFICIAL"])]
            : target.appRoles.filter((role) => role !== "OFFICIAL").length
              ? target.appRoles.filter((role) => role !== "OFFICIAL")
              : ["LISTENER"],
        },
      },
      select: { publicId: true, name: true, isOfficial: true, updatedAt: true },
    });
    await tx.auditLog.create({
      data: {
        adminId: admin.id,
        action: body.official
          ? "USER_MARKED_OFFICIAL"
          : "USER_UNMARKED_OFFICIAL",
        category: "USER_MANAGEMENT",
        entityType: "User",
        entityId: target.publicId,
        description: `${admin.name} ${body.official ? "marked" : "unmarked"} user ${target.publicId} as an official account.`,
        metadata: {
          previousValue: target.isOfficial,
          isOfficial: body.official,
          source: "ADMIN_API",
        },
      },
    });
    return updated;
  });
  return json({
    success: true,
    data: {
      user: {
        id: user.publicId,
        publicId: user.publicId,
        name: user.name,
        isOfficial: user.isOfficial,
        updatedAt: user.updatedAt.toISOString(),
      },
    },
  });
}
