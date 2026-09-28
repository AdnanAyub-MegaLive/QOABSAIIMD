import { prisma } from "@/lib/prisma";
import { mobileApiError, mobileJson, mobileOptions, requireMobileUser } from "@/lib/mobile-api";

export function OPTIONS() { return mobileOptions(); }

async function targetFor(request, params) {
  const viewer = await requireMobileUser(request);
  const { publicId } = await params;
  const target = await prisma.user.findUnique({
    where: { publicId: decodeURIComponent(publicId) },
    select: { id: true, publicId: true, status: true, deletedAt: true },
  });
  if (!target || target.deletedAt || target.status !== "ACTIVE") throw new Error("USER_NOT_FOUND");
  if (target.id === viewer.id) throw Object.assign(new Error("You cannot follow yourself."), { code: "SELF_FOLLOW" });
  const blocked = await prisma.userBlock.findFirst({
    where: { OR: [{ blockerId: viewer.id, blockedId: target.id }, { blockerId: target.id, blockedId: viewer.id }] },
  });
  if (blocked) throw new Error("USER_BLOCKED");
  return { viewer, target };
}

async function state(viewerId, targetId) {
  const [following, followsYou, followers, followingCount] = await Promise.all([
    prisma.userFollow.findUnique({ where: { followerId_followedId: { followerId: viewerId, followedId: targetId } } }),
    prisma.userFollow.findUnique({ where: { followerId_followedId: { followerId: targetId, followedId: viewerId } } }),
    prisma.userFollow.count({ where: { followedId: targetId } }),
    prisma.userFollow.count({ where: { followerId: targetId } }),
  ]);
  return { following: Boolean(following), followsYou: Boolean(followsYou), followers, followingCount };
}

export async function GET(request, { params }) {
  try { const { viewer, target } = await targetFor(request, params); return mobileJson({ success: true, data: await state(viewer.id, target.id) }); }
  catch (error) { return mobileApiError(error, "FOLLOW_STATUS_FAILED"); }
}

export async function POST(request, { params }) {
  try {
    const { viewer, target } = await targetFor(request, params);
    await prisma.userFollow.upsert({
      where: { followerId_followedId: { followerId: viewer.id, followedId: target.id } },
      create: { followerId: viewer.id, followedId: target.id }, update: {},
    });
    globalThis.portalIo?.to(`user:${target.publicId}`).emit("profile:followed", { success: true, data: { userId: viewer.publicId } });
    return mobileJson({ success: true, data: await state(viewer.id, target.id) });
  } catch (error) { return mobileApiError(error, "FOLLOW_FAILED"); }
}

export async function DELETE(request, { params }) {
  try {
    const { viewer, target } = await targetFor(request, params);
    await prisma.userFollow.deleteMany({ where: { followerId: viewer.id, followedId: target.id } });
    return mobileJson({ success: true, data: await state(viewer.id, target.id) });
  } catch (error) { return mobileApiError(error, "UNFOLLOW_FAILED"); }
}
