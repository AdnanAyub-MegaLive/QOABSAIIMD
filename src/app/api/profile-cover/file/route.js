import { prisma } from "@/lib/prisma";
import { verifyCoverToken } from "@/lib/profile-cover";
export async function GET(request) {
  const token = verifyCoverToken(new URL(request.url).searchParams.get("token"));
  if (!token) return new Response(null, { status: 403 });
  const [row, users, blocked, ban] = await Promise.all([
    prisma.profileCover.findUnique({ where: { userId: token.ownerId } }),
    prisma.user.findMany({ where: { id: { in: [token.ownerId, token.viewerId] }, deletedAt: null, status: "ACTIVE" }, select: { id: true, profilePrivate: true } }),
    prisma.userBlock.findFirst({ where: { OR: [{ blockerId: token.viewerId, blockedId: token.ownerId }, { blockerId: token.ownerId, blockedId: token.viewerId }] } }),
    prisma.ban.findFirst({ where: { userId: { in: [token.ownerId, token.viewerId] }, revokedAt: null, startsAt: { lte: new Date() }, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } }),
  ]);
  const self = token.ownerId === token.viewerId;
  if (!row || row.revision !== token.revision || users.length !== (self ? 1 : 2) || blocked || ban || (!self && row.status !== "APPROVED")) return new Response(null, { status: 404 });
  if (!self && users.find(u => u.id === token.ownerId)?.profilePrivate) {
    const friend = await prisma.friendRequest.findFirst({ where: { status: "ACCEPTED", OR: [{ requesterId: token.ownerId, addresseeId: token.viewerId }, { requesterId: token.viewerId, addresseeId: token.ownerId }] } });
    if (!friend) return new Response(null, { status: 404 });
  }
  return new Response(row.imageData, { headers: { "Content-Type": "image/webp", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
