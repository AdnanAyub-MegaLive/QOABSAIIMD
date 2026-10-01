import { requirePagePermission } from "@/lib/portal-admin";
import { redirect } from "next/navigation";
import { auth, signOut } from "../../../auth";
import TalentTabs from "./talent-tabs";
import PortalHostManagement from "./portal-host-management";
import FeatureSearch from "../components/feature-search";
import PortalSidebar from "../components/portal-sidebar";
import { prisma } from "../../lib/prisma";
import { reconcileExpiredBans } from "../../lib/ban-maintenance";

export default async function TalentsPage() {
  await requirePagePermission("hosts.view");
  const session = await auth();
  if (!session?.user) redirect("/");
  await reconcileExpiredBans();
  const [talents, devices, agencies, portalHosts, hostCandidates] = await Promise.all([
    prisma.talent.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        verifications: { orderBy: { submittedAt: "desc" } },
        receivedGifts: {
          include: { sender: true },
          orderBy: { createdAt: "desc" },
        },
        salaryHistory: { orderBy: { periodStart: "desc" } },
        liveSessions: { orderBy: { startedAt: "desc" } },
        performance: { orderBy: { period: "desc" } },
        violations: { orderBy: { createdAt: "desc" } },
      },
    }),
    prisma.device.findMany({
      where: { talentId: { not: null } },
      include: { talent: true },
      orderBy: { lastLoginAt: "desc" },
    }),
    prisma.agency.findMany({
      where: { status: "ACTIVE" },
      select: { publicId: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: { deletedAt: null, appRoles: { has: "HOST" } },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        publicId: true,
        name: true,
        email: true,
        phone: true,
        country: true,
        profileImage: true,
        status: true,
        isVerified: true,
        hostSalaryCoinBalance: true,
        agency: { select: { publicId: true, name: true } },
        audioRooms: {
          select: {
            roomId: true,
            title: true,
            status: true,
            participantCount: true,
            startedAt: true,
            endedAt: true,
          },
        },
        walletWithdrawals: {
          where: { status: { in: ["PENDING", "APPROVED"] } },
          select: {
            publicId: true,
            status: true,
            coins: true,
            cashAmount: true,
            currency: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        _count: { select: { receivedGifts: true, walletWithdrawals: true } },
      },
    }),
    prisma.user.findMany({
      where: { deletedAt: null, status: { in: ["ACTIVE", "PENDING"] } },
      orderBy: { createdAt: "desc" },
      take: 300,
      select: {
        publicId: true,
        name: true,
        phone: true,
        country: true,
        appRoles: true,
      },
    }),
  ]);
  const portalGiftTotals = portalHosts.length
    ? await prisma.giftTransaction.groupBy({
        by: ["recipientUserId"],
        where: { recipientUserId: { in: portalHosts.map((host) => host.id) } },
        _sum: { coinValue: true },
      })
    : [];
  const giftsByHostId = new Map(
    portalGiftTotals.map((item) => [item.recipientUserId, item._sum.coinValue ?? 0n]),
  );
  const operationalHosts = portalHosts.map((host) => {
    const room = host.audioRooms[0] ?? null;
    const withdrawal = host.walletWithdrawals[0] ?? null;
    return {
      id: host.publicId,
      name: host.name,
      email: host.email,
      phone: host.phone,
      country: host.country,
      profileImage: host.profileImage,
      status: host.status,
      isVerified: host.isVerified,
      agency: host.agency
        ? { id: host.agency.publicId, name: host.agency.name }
        : null,
      salaryCoins: host.hostSalaryCoinBalance.toString(),
      giftCoins: (giftsByHostId.get(host.id) ?? 0n).toString(),
      giftCount: host._count.receivedGifts,
      withdrawalCount: host._count.walletWithdrawals,
      room: room
        ? {
            id: room.roomId,
            title: room.title,
            status: room.status,
            participantCount: room.participantCount,
            startedAt: room.startedAt.toISOString(),
            endedAt: room.endedAt?.toISOString() ?? null,
          }
        : null,
      openWithdrawal: withdrawal
        ? {
            id: withdrawal.publicId,
            status: withdrawal.status,
            coins: withdrawal.coins.toString(),
            cashAmount: withdrawal.cashAmount.toString(),
            currency: withdrawal.currency,
            createdAt: withdrawal.createdAt.toISOString(),
          }
        : null,
    };
  });
  const promotableUsers = hostCandidates
    .filter((user) => !user.appRoles.includes("HOST"))
    .map((user) => ({
      id: user.publicId,
      name: user.name,
      phone: user.phone,
      country: user.country,
    }));
  const talentData = talents.map((talent) => [
    talent.displayName,
    display(talent.type),
    talent.publicId,
    display(talent.verification),
    Number(talent.totalGiftsValue).toLocaleString(),
    talent.followers.toLocaleString(),
  ]);
  const deviceData = devices.map((device) => ({
    userId: device.talent.publicId,
    userName: device.talent.displayName,
    ip: device.lastLoginIp ?? "—",
    mac: device.macAddress,
    location: device.location ?? "Unknown",
    loginTime:
      device.lastLoginAt?.toLocaleString("en-US", {
        dateStyle: "medium",
        timeStyle: "medium",
      }) ?? "Never",
    isUserBanned: device.talent.status === "BANNED",
    isDeviceBanned: device.isBanned,
  }));
  const talentModules = {
    verification: talents.flatMap((talent) =>
      talent.verifications.map((item) => ({
        id: item.id,
        talentId: talent.publicId,
        talent: talent.displayName,
        status: display(item.status),
        identityFront: item.identityCardFront ? "Submitted" : "Missing",
        identityBack: item.identityCardBack ? "Submitted" : "Missing",
        profileImage: item.profileImage ? "Submitted" : "Missing",
        submitted: item.submittedAt.toLocaleDateString("en-US"),
        reviewed: item.reviewedAt?.toLocaleDateString("en-US") ?? "Pending",
      })),
    ),
    gifts: talents.flatMap((talent) =>
      talent.receivedGifts.map((item) => ({
        id: item.id,
        talentId: talent.publicId,
        talent: talent.displayName,
        senderId: item.sender.publicId,
        sender: item.sender.name,
        gift: item.giftName,
        quantity: item.quantity,
        value: Number(item.coinValue).toLocaleString(),
        received: item.createdAt.toLocaleString("en-US"),
      })),
    ),
    salaries: talents.flatMap((talent) =>
      talent.salaryHistory.map((item) => ({
        id: item.id,
        talentId: talent.publicId,
        talent: talent.displayName,
        period: `${item.periodStart.toLocaleDateString("en-US")} – ${item.periodEnd.toLocaleDateString("en-US")}`,
        amount: `${item.currency} ${Number(item.amount).toLocaleString()}`,
        status: item.status,
        paid: item.paidAt?.toLocaleDateString("en-US") ?? "—",
        notes: item.notes ?? "—",
      })),
    ),
    liveHistory: talents.flatMap((talent) =>
      talent.liveSessions.map((item) => ({
        id: item.id,
        talentId: talent.publicId,
        talent: talent.displayName,
        room: item.roomId,
        type: item.streamType,
        started: item.startedAt.toLocaleString("en-US"),
        duration: item.endedAt
          ? `${Math.round((item.endedAt - item.startedAt) / 60000)} min`
          : "Live",
        peakViewers: item.peakViewers,
        gifts: Number(item.giftsValue).toLocaleString(),
        status: item.status,
      })),
    ),
    performance: talents.flatMap((talent) =>
      talent.performance.map((item) => ({
        id: item.id,
        talentId: talent.publicId,
        talent: talent.displayName,
        period: item.period,
        liveMinutes: item.liveMinutes.toLocaleString(),
        viewers: item.uniqueViewers.toLocaleString(),
        followers: item.newFollowers.toLocaleString(),
        gifts: Number(item.giftsValue).toLocaleString(),
        engagement: `${Number(item.engagementRate)}%`,
      })),
    ),
    violations: talents.flatMap((talent) =>
      talent.violations.map((item) => ({
        id: item.id,
        talentId: talent.publicId,
        talent: talent.displayName,
        category: item.category.replaceAll("_", " "),
        severity: item.severity,
        description: item.description,
        status: item.status,
        action: item.actionTaken ?? "—",
        reported: item.createdAt.toLocaleDateString("en-US"),
      })),
    ),
  };
  return (
    <main className="min-h-screen bg-[#f4f8f7] text-[#142c2a]">
      <PortalSidebar />
      <section className="lg:pl-64">
        <header className="flex h-20 items-center gap-6 border-b border-[#dfe9e7] bg-white px-6 md:px-10">
          <div className="shrink-0">
            <p className="text-xs font-semibold tracking-widest text-[#16877d] uppercase">
              Management
            </p>
            <h1 className="text-xl font-bold">Hosts</h1>
          </div>
          <FeatureSearch />
          <div className="ml-auto flex items-center gap-4">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold">{session.user.name}</p>
              <p className="text-xs text-[#718580]">{session.user.email}</p>
            </div>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <button className="rounded-lg border border-[#d7e4e1] px-4 py-2 text-xs font-semibold text-[#526b67] hover:bg-[#f1f7f5]">
                Sign out
              </button>
            </form>
          </div>
        </header>
        <div className="mx-auto max-w-7xl p-6 md:p-10">
          <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-2xl font-bold">Host management</h2>
              <p className="mt-1.5 text-sm text-[#71847f]">
                Manage MegaLive portal hosts, their agencies, verification,
                audio rooms, earnings, gifts, and payouts.
              </p>
            </div>
          </div>
          <PortalHostManagement
            hosts={operationalHosts}
            candidates={promotableUsers}
            agencies={agencies.map((agency) => ({
              id: agency.publicId,
              name: agency.name,
            }))}
          />
          <section className="mt-10 border-t border-[#dce7e4] pt-10">
            <div className="mb-6">
              <h3 className="text-lg font-bold">Legacy host records</h3>
              <p className="mt-1 text-sm text-[#71847f]">
                Historical Talent data retained for review during the MegaLive
                migration.
              </p>
            </div>
            <TalentTabs
              initialTalents={talentData}
              devices={deviceData}
              modules={talentModules}
            />
          </section>
        </div>
      </section>
    </main>
  );
}

function display(value) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
