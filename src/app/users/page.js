import { hasPermission } from '@/lib/portal-permissions';
import DirectoryExport from '../components/directory-export';
import { requirePagePermission } from "@/lib/portal-admin";
import { scopedUserWhere } from "@/lib/staff-scope";
import { redirect } from "next/navigation";
import { auth, signOut } from "../../../auth";
import ManagementTabs from "./management-tabs";
import AddAccountModal from "../components/add-account-modal";
import FeatureSearch from "../components/feature-search";
import PortalSidebar from "../components/portal-sidebar";
import { prisma } from "../../lib/prisma";
import { reconcileExpiredBans } from "../../lib/ban-maintenance";
import { reconcileExpiredSpecialIds } from "../../lib/special-id";
import { reconcileExpiredAudioRoomRestrictions } from "../../lib/audio-room-maintenance";
import { readPaging, splitPage } from "@/lib/portal-paging";

export default async function UsersPage({ searchParams }) {
  const admin = await requirePagePermission("users.view");
  const session = await auth();
  if (!session?.user) redirect("/");
  await reconcileExpiredBans();
  await reconcileExpiredSpecialIds();
  await reconcileExpiredAudioRoomRestrictions();
  const paging = readPaging(await searchParams);
  const scope = scopedUserWhere(admin);
  const baseWhere = { deletedAt: null, ...scope };
  const q = paging.q;
  const search = q ? { OR: [
    { publicId: { contains: q, mode: "insensitive" } },
    { name: { contains: q, mode: "insensitive" } },
    { phone: { contains: q } },
    { email: { contains: q, mode: "insensitive" } },
  ] } : {};
  const userWhere = { ...baseWhere, ...search };
  const userInclude = {
    _count: { select: { sentGifts: true } },
    specialIds: { include: { definition: true }, orderBy: { createdAt: "desc" }, take: 5 },
  };
  // One page of users (plus one row to detect a next page). Other tabs load their
  // own bounded, newest-first slices instead of every row for every user.
  const [pageRows, totalUsers, activeUsers, vipUsers, deviceTotal, bannedUsers, deviceRows, audioRooms, albumItems, specialIdRows, topSpenders, gameLogs, specialIdDefinitions] = await Promise.all([
    prisma.user.findMany({ where: userWhere, orderBy: [{ createdAt: "desc" }, { id: "desc" }], include: userInclude, skip: paging.skip, take: paging.take + 1 }),
    prisma.user.count({ where: userWhere }),
    prisma.user.count({ where: { ...userWhere, status: "ACTIVE" } }),
    prisma.user.count({ where: { ...userWhere, vipLevel: { gt: 0 } } }),
    prisma.device.count({ where: { userId: { not: null }, user: baseWhere } }),
    prisma.user.findMany({ where: { ...baseWhere, status: "BANNED" }, orderBy: { updatedAt: "desc" }, include: userInclude, take: 200 }),
    prisma.device.findMany({ where: { userId: { not: null }, user: userWhere }, include: { user: true }, orderBy: { lastLoginAt: "desc" }, take: 200 }),
    prisma.audioRoom.findMany({ where: { owner: scope }, include: { owner: true }, orderBy: { startedAt: "desc" }, take: 250 }),
    prisma.userAlbumItem.findMany({ where: { user: userWhere }, include: { user: { select: { publicId: true, name: true } } }, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.specialIdAssignment.findMany({ where: { user: userWhere }, include: { definition: true, user: { select: { publicId: true, name: true } } }, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.user.findMany({ where: baseWhere, orderBy: { totalSpent: "desc" }, include: { _count: { select: { sentGifts: true } } }, take: 100 }),
    prisma.gameLog.findMany({ where: { user: userWhere }, include: { user: { select: { publicId: true, name: true } } }, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.specialIdDefinition.findMany({
      where: { active: true },
      include: { assignments: { where: { status: "ACTIVE", revokedAt: null, expiresAt: { gt: new Date() } }, include: { user: true } } },
      orderBy: [{ category: "desc" }, { code: "asc" }],
    }),
  ]);
  const { items: pageUsers, hasNext } = splitPage(pageRows, paging.take);
  // Banned users stay listed in the ban tab even when they are not on this page.
  const users = [...pageUsers, ...bannedUsers.filter(b => !pageUsers.some(u => u.id === b.id))];
  const devices = deviceRows;
  const userData = users.map((user) => {
    const activeSpecialId = user.specialIds.find(
      (item) =>
        item.status === "ACTIVE" &&
        !item.revokedAt &&
        item.expiresAt &&
        item.expiresAt > new Date(),
    );
    return {
      id: user.publicId,
      effectiveId: activeSpecialId?.specialId ?? user.publicId,
      specialId: activeSpecialId?.specialId ?? null,
      specialIdExpiresAt: activeSpecialId?.expiresAt?.toISOString() ?? null,
      name: user.name,
      email: user.phone,
      phone: user.phone,
      actualEmail: user.email,
      passwordSet: Boolean(user.passwordHash),
      initials: user.name
        .split(" ")
        .map((part) => part[0])
        .join(""),
      role: display(user.role),
      roles: user.appRoles.map(display),
      isOfficial: Boolean(user.isOfficial),
      status: display(user.status),
      joined: user.createdAt.toLocaleDateString("en-US", { ...({
        month: "short",
        day: "2-digit",
        year: "numeric",
      }), timeZone: 'Asia/Bangkok' }),
      streams: user._count.sentGifts,
      vipLevel: user.vipLevel,
      vip: user.vipLevel > 0,
      totalSpent: Number(user.totalSpent),
      totalTopUp: Number(user.totalTopUp),
      balance: String(user.coinBalance),
      diamondBalance: String(user.hostSalaryCoinBalance),
      gifts: user._count.sentGifts,
    };
  });
  const deviceData = devices.map((device) => ({
    userId: device.user.publicId,
    userName: device.user.name,
    ip: device.lastLoginIp ?? "—",
    mac: device.macAddress,
    location: device.location ?? "Unknown",
    loginTime:
      device.lastLoginAt?.toLocaleString("en-US", { ...({
        dateStyle: "medium",
        timeStyle: "medium",
      }), timeZone: 'Asia/Bangkok' }) ?? "Never",
    isUserBanned: device.user.status === "BANNED",
    isDeviceBanned: device.isBanned,
  }));
  const audioRoomData = audioRooms.map((room) => ({
    roomId: room.roomId,
    title: room.title,
    ownerId: room.owner.publicId,
    owner: room.owner.name,
    status: room.status,
    participantCount: room.participantCount,
    startedAt: room.startedAt.toLocaleString("en-US", { timeZone: 'Asia/Bangkok' }),
    audioUrl: room.liveAudioUrl ?? room.recordingUrl,
    joiningDisabled: room.joiningDisabled,
    joiningDisabledUntil: room.joiningDisabledUntil?.toISOString() ?? null,
    isBlocked: room.isBlocked,
    blockedUntil: room.blockedUntil?.toISOString() ?? null,
    terminatedUntil: room.terminatedUntil?.toISOString() ?? null,
  }));
  const when = (date) => date.toLocaleString("en-US", { timeZone: 'Asia/Bangkok' });
  const userModules = {
    albums: albumItems.map((item) => ({
      id: item.id, userId: item.user.publicId, user: item.user.name, type: item.mediaType,
      caption: item.caption ?? "—", status: item.status,
      uploaded: item.createdAt.toLocaleDateString("en-US", { timeZone: 'Asia/Bangkok' }),
    })),
    specialIds: specialIdRows.map((item) => ({
      id: item.id, userId: item.user.publicId, user: item.user.name, specialId: item.specialId,
      category: item.definition?.category ?? "LEGACY", source: item.source, status: item.status,
      durationMinutes: item.expiresAt ? Math.max(1, Math.round((item.expiresAt - item.startsAt) / 60000)) : null,
      starts: when(item.startsAt), expires: item.expiresAt ? when(item.expiresAt) : "Legacy",
    })),
    topHistory: topSpenders.map((user, index) => ({
      id: user.publicId, rank: index + 1, user: user.name, userId: user.publicId,
      totalSpent: Number(user.totalSpent).toLocaleString(), gifts: user._count.sentGifts, vip: `VIP ${user.vipLevel}`,
    })),
    gameLogs: gameLogs.map((item) => ({
      id: item.id, reference: item.referenceId, userId: item.user.publicId, user: item.user.name, game: item.gameName,
      wager: Number(item.wager).toLocaleString(), payout: Number(item.payout).toLocaleString(), result: item.result, played: when(item.createdAt),
    })),
  };
  const specialIdCatalog = specialIdDefinitions.map((item) => ({
    id: item.id,
    coinPrice: item.coinPrice?.toString() ?? null,
    storeVisible: item.storeVisible,
    code: item.code,
    category: item.category,
    minimumVipLevel: item.minimumVipLevel,
    minimumTopUpAmount: Number(item.minimumTopUpAmount ?? 0),
    defaultDurationMinutes: item.defaultDurationMinutes,
    active: item.active,
    assignedTo: item.assignments[0]?.user.publicId ?? null,
    expiresAt: item.assignments[0]?.expiresAt?.toISOString() ?? null,
  }));
  return (
    <main className="portal-ui min-h-screen bg-[#f4f8f7] text-[#142c2a]">
      <PortalSidebar />
      <section id="portal-content" tabIndex={-1} className="lg:pl-64">
        <header className="flex h-20 items-center gap-6 border-b border-[#dfe9e7] bg-white px-6 md:px-10">
          <div className="shrink-0">
            <p className="text-xs font-semibold tracking-widest text-[#16877d] uppercase">
              Management
            </p>
            <h1 className="text-xl font-bold">Users / Senders</h1>
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
        </header>{hasPermission(admin,"users.export")&&<div className="px-6"><DirectoryExport kind="users"/></div>}
        <div className="mx-auto max-w-7xl p-6 md:p-10">
          <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-2xl font-bold">Sender management</h2>
              <p className="mt-1.5 text-sm text-[#71847f]">
                Manage users who watch, listen, and send gifts to hosts.
              </p>
            </div>
            <AddAccountModal type="user" />
          </div>
          <ManagementTabs
            canAdjustCoins={hasPermission(admin, "finance.adjust")}
            users={userData}
            devices={deviceData}
            paging={{ page: paging.page, hasNext, totalUsers, activeUsers, vipUsers, deviceTotal, pageUserIds: pageUsers.map(u => u.publicId) }}
            modules={userModules}
            audioRooms={audioRoomData}
            specialIdCatalog={specialIdCatalog}
          />
        </div>
      </section>
    </main>
  );
}

function display(value) {
  if (value === "BD") return "BD";
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
