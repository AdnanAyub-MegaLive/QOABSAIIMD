import { prisma } from "@/lib/prisma";
import {
  mobileApiError,
  mobileJson,
  mobileOptions,
  requireMobileUser,
} from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return mobileOptions();
}

export async function GET(request) {
  try {
    const user = await requireMobileUser(request);
    const agency = await prisma.agency.findUnique({
      where: { ownerUserId: user.id },
      select: {
        id: true,
        publicId: true,
        name: true,
        status: true,
        createdAt: true,
        commissionCoinBalance: true,
        monthlyTargetCoins: true,
        userHosts: {
          where: { deletedAt: null },
          select: {
            publicId: true,
            name: true,
            profileImage: true,
            hostSalaryCoinBalance: true,
          },
          orderBy: { name: "asc" },
        },
        joinRequests: {
          where: { status: "PENDING", user: { deletedAt: null } },
          select: {
            publicId: true,
            createdAt: true,
            user: {
              select: {
                publicId: true,
                name: true,
                profileImage: true,
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    const monthStart = new Date(
      Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1),
    );
    const [lifetimeGifting, monthlySalary] = agency
      ? await Promise.all([
          prisma.giftSettlement.aggregate({
            where: { agencyId: agency.id },
            _sum: { grossCoins: true },
          }),
          prisma.giftSettlement.aggregate({
            where: { agencyId: agency.id, createdAt: { gte: monthStart } },
            _sum: { hostSalaryCoins: true },
          }),
        ])
      : [{ _sum: { grossCoins: null } }, { _sum: { hostSalaryCoins: null } }];

    return mobileJson({
      success: true,
      data: {
        agency: agency
          ? {
              id: agency.publicId,
              name: agency.name,
              status: agency.status,
              createdAt: agency.createdAt.toISOString(),
              commissionCoinBalance: agency.commissionCoinBalance.toString(),
              monthlyTargetCoins: agency.monthlyTargetCoins.toString(),
              monthlySalaryCoins: String(
                monthlySalary._sum.hostSalaryCoins ?? 0n,
              ),
              totalRechargeCoins: "0",
              totalGiftingCoins: String(
                lifetimeGifting._sum.grossCoins ?? 0n,
              ),
              hosts: agency.userHosts.map((host) => ({
                id: host.publicId,
                name: host.name,
                profileImage: host.profileImage,
                salaryCoinBalance: host.hostSalaryCoinBalance.toString(),
              })),
              pendingJoinRequests: agency.joinRequests.map((joinRequest) => ({
                id: joinRequest.publicId,
                userId: joinRequest.user.publicId,
                userName: joinRequest.user.name,
                userProfileImage: joinRequest.user.profileImage,
                createdAt: joinRequest.createdAt.toISOString(),
              })),
            }
          : null,
      },
    });
  } catch (error) {
    console.error("Agency owner dashboard failed", error);
    return mobileApiError(error, "AGENCY_DASHBOARD_FAILED");
  }
}
