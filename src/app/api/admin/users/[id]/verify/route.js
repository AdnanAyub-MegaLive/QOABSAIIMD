import { auth } from "../../../../../../../auth";
import { prisma } from "@/lib/prisma";
import {
  shouldAssignTalentPublicId,
  talentPublicIdForApprovedHost,
} from "@/lib/host-public-id";
import { emitToUser } from "@/lib/realtime";

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
    select: { id: true, name: true, email: true, role: true },
  });
}

export async function PATCH(request, { params }) {
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
  if (typeof body?.verified !== "boolean")
    return json(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "verified must be a boolean.",
        },
      },
      422,
    );

  const { id } = await params;
  const target = await prisma.user.findFirst({
    where: {
      deletedAt: null,
      OR: [{ id }, { publicId: id }],
    },
    select: { id: true, publicId: true, isVerified: true, role: true, appRoles: true, agencyId: true, status: true },
  });
  if (!target)
    return json(
      {
        success: false,
        error: { code: "USER_NOT_FOUND", message: "User not found." },
      },
      404,
    );

  const nextPublicId = shouldAssignTalentPublicId({
    hostEnabled: Boolean(target.agencyId) && (target.role === "HOST" || target.appRoles.includes("HOST")),
    isVerified: body.verified,
    status: target.status,
  })
    ? talentPublicIdForApprovedHost(target.publicId)
    : target.publicId;
  if (nextPublicId !== target.publicId) {
    const conflict = await prisma.user.findUnique({
      where: { publicId: nextPublicId },
      select: { id: true },
    });
    if (conflict && conflict.id !== target.id)
      return json(
        { success: false, error: { code: "HOST_PUBLIC_ID_CONFLICT", message: "The Talent ID is already assigned." } },
        409,
      );
  }
  const user = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: target.id },
      data: {
        isVerified: body.verified,
        publicId: nextPublicId,
        ...(nextPublicId !== target.publicId ? { sessionVersion: { increment: 1 } } : {}),
      },
      select: { publicId: true, name: true, isVerified: true, updatedAt: true },
    });
    if (nextPublicId !== target.publicId) {
      await tx.legacyIdMapping.updateMany({
        where: { userId: target.id, entityType: "USER", publicId: target.publicId },
        data: { publicId: nextPublicId },
      });
      await tx.auditLog.updateMany({
        where: { entityType: "User", entityId: target.publicId },
        data: { entityId: nextPublicId },
      });
    }
    await tx.auditLog.create({
      data: {
        adminId: admin.id,
        action: body.verified ? "USER_VERIFIED" : "USER_UNVERIFIED",
        category: "USER_MANAGEMENT",
        entityType: "User",
        entityId: nextPublicId,
        description: `${admin.name} ${body.verified ? "verified" : "removed verification from"} user ${nextPublicId}.`,
        metadata: {
          previousValue: target.isVerified,
          isVerified: body.verified,
          previousPublicId: target.publicId,
          publicId: nextPublicId,
          source: "ADMIN_API",
        },
      },
    });
    return updated;
  });
  if (nextPublicId !== target.publicId) {
    emitToUser(target.publicId, "host:approved", {
      previousUserId: target.publicId,
      userId: nextPublicId,
      sessionInvalidated: true,
    });
  }

  return json({
    success: true,
    data: {
      user: {
        id: user.publicId,
        publicId: user.publicId,
        name: user.name,
        isVerified: user.isVerified,
        updatedAt: user.updatedAt.toISOString(),
      },
    },
  });
}
