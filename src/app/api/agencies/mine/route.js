import { prisma } from "@/lib/prisma";
import { referenceDto } from "@/lib/agency-reference";
import { requestOrigin, resolveUserPerks } from "@/lib/user-perks";
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
    const agencyId=new URL(request.url).searchParams.get("agencyId");
    const agencies=await prisma.agency.findMany({where:{ownerUserId:user.id},select:{publicId:true,name:true,status:true},orderBy:{publicId:"asc"}});
    if(!agencyId&&agencies.length>1)return mobileJson({success:true,data:{agency:null,agencies,requiresAgencySelection:true}});
    if(agencyId&&!agencies.some(a=>a.publicId===agencyId))return mobileJson({success:false,error:{code:"AGENCY_NOT_FOUND",message:"You do not own this agency."}},404);
    const agency = await prisma.agency.findFirst({
      where: { ownerUserId: user.id,...(agencyId?{publicId:agencyId}:{}) },
      select: {
        id: true,
        country: true,
        bd: { select: { id: true, publicId: true, name: true, profileImage: true, appRoles: true, country: true } },
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
          where: { status: "PENDING", direction: "USER_REQUEST", user: { deletedAt: null } },
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
    const referencePerks = await resolveUserPerks(agency?.bd ? [agency.bd] : [], requestOrigin(request), ["FRAMES"]);
    const monthStart = new Date(
      Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1),
    );
    const [lifetimeGifting, monthlySalary, recharge] = agency
      ? await Promise.all([
          prisma.giftSettlement.aggregate({
            where: { agencyId: agency.id, giftTransaction: { reversedAt: null } },
            _sum: { grossCoins: true },
          }),
          prisma.giftSettlement.aggregate({
            where: { agencyId: agency.id, giftTransaction: { reversedAt: null }, createdAt: { gte: monthStart } },
            _sum: { hostSalaryCoins: true },
          }),
          prisma.user.aggregate({ where: { agencyId: agency.id }, _sum: { totalTopUp: true } }),
        ])
      : [{ _sum: { grossCoins: null } }, { _sum: { hostSalaryCoins: null } }];

    return mobileJson({
      success: true,
      data: {
        agencies,
        agency: agency
          ? {
              id: agency.publicId,
              country: agency.country,
              bdReference: referenceDto(agency.bd, referencePerks),
              name: agency.name,
              status: agency.status,
              createdAt: agency.createdAt.toISOString(),
              commissionCoinBalance: agency.commissionCoinBalance.toString(),
              monthlyTargetCoins: agency.monthlyTargetCoins.toString(),
              monthlySalaryCoins: String(
                monthlySalary._sum.hostSalaryCoins ?? 0n,
              ),
              totalRechargeCoins: String(recharge._sum.totalTopUp ?? 0n),
              rechargeBasis: "CURRENT_HOSTS_LIFETIME",
              ...await activityProgress("AGENCY",agency.id,requestOrigin(request)).then(p=>({agencyLevel:p.level,level:p.level,nextLevelThreshold:p.nextThreshold,progression:p})),
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
import { activityProgress } from "@/lib/activity-levels";
