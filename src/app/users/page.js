import { requirePagePermission } from "@/lib/portal-admin";
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

export default async function UsersPage() {
  await requirePagePermission("users.view");
  const session = await auth();
  if (!session?.user) redirect("/");
  await reconcileExpiredBans();
  await reconcileExpiredSpecialIds();
  await reconcileExpiredAudioRoomRestrictions();
  const [users, devices, audioRooms, specialIdDefinitions] = await Promise.all([
    prisma.user.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { sentGifts: true } },
        albumItems: { orderBy: { createdAt: "desc" } },
        specialIds: {
          include: { definition: true },
          orderBy: { createdAt: "desc" },
        },
        gameLogs: { orderBy: { createdAt: "desc" } },
      },
    }),
    prisma.device.findMany({
      where: { userId: { not: null }, user: { deletedAt: null } },
      include: { user: true },
      orderBy: { lastLoginAt: "desc" },
    }),
    prisma.audioRoom.findMany({
      include: { owner: true },
      orderBy: { startedAt: "desc" },
      take: 250,
    }),
    prisma.specialIdDefinition.findMany({
      where: { active: true },
      include: {
        assignments: {
          where: {
            status: "ACTIVE",
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
          include: { user: true },
        },
      },
      orderBy: [{ category: "desc" }, { code: "asc" }],
    }),
  ]);
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
      joined: user.createdAt.toLocaleDateString("en-US", {
        month: "short",
        day: "2-digit",
        year: "numeric",
      }),
      streams: user._count.sentGifts,
      vipLevel: user.vipLevel,
      vip: user.vipLevel > 0,
      totalSpent: Number(user.totalSpent),
      totalTopUp: Number(user.totalTopUp),
      balance: Number(user.coinBalance),
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
      device.lastLoginAt?.toLocaleString("en-US", {
        dateStyle: "medium",
        timeStyle: "medium",
      }) ?? "Never",
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
    startedAt: room.startedAt.toLocaleString("en-US"),
    audioUrl: room.liveAudioUrl ?? room.recordingUrl,
    joiningDisabled: room.joiningDisabled,
    joiningDisabledUntil: room.joiningDisabledUntil?.toISOString() ?? null,
    isBlocked: room.isBlocked,
    blockedUntil: room.blockedUntil?.toISOString() ?? null,
    terminatedUntil: room.terminatedUntil?.toISOString() ?? null,
  }));
  const userModules = {
    levels: users.map((user) => ({
      id: user.publicId,
      userId: user.publicId,
      user: user.name,
      level: levelFromSpend(user.totalSpent),
      totalSpent: Number(user.totalSpent).toLocaleString(),
      vipLevel: user.vipLevel,
      progress: `${Number(user.totalSpent) % 50000} / 50,000`,
    })),
    albums: users.flatMap((user) =>
      user.albumItems.map((item) => ({
        id: item.id,
        userId: user.publicId,
        user: user.name,
        type: item.mediaType,
        caption: item.caption ?? "—",
        status: item.status,
        uploaded: item.createdAt.toLocaleDateString("en-US"),
      })),
    ),
    specialIds: users.flatMap((user) =>
      user.specialIds.map((item) => ({
        id: item.id,
        userId: user.publicId,
        user: user.name,
        specialId: item.specialId,
        category: item.definition?.category ?? "LEGACY",
        source: item.source,
        status: item.status,
        durationMinutes: item.expiresAt
          ? Math.max(1, Math.round((item.expiresAt - item.startsAt) / 60000))
          : null,
        starts: item.startsAt.toLocaleString("en-US"),
        expires: item.expiresAt?.toLocaleString("en-US") ?? "Legacy",
      })),
    ),
    topHistory: [...users]
      .sort((a, b) => Number(b.totalSpent - a.totalSpent))
      .map((user, index) => ({
        id: user.publicId,
        rank: index + 1,
        user: user.name,
        userId: user.publicId,
        totalSpent: Number(user.totalSpent).toLocaleString(),
        gifts: user._count.sentGifts,
        vip: `VIP ${user.vipLevel}`,
      })),
    gameLogs: users.flatMap((user) =>
      user.gameLogs.map((item) => ({
        id: item.id,
        reference: item.referenceId,
        userId: user.publicId,
        user: user.name,
        game: item.gameName,
        wager: Number(item.wager).toLocaleString(),
        payout: Number(item.payout).toLocaleString(),
        result: item.result,
        played: item.createdAt.toLocaleString("en-US"),
      })),
    ),
  };
  const specialIdCatalog = specialIdDefinitions.map((item) => ({
    id: item.id,
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
    <main className="min-h-screen bg-[#f4f8f7] text-[#142c2a]">
      <PortalSidebar />
      <section className="lg:pl-64">
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
        </header>
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
            users={userData}
            devices={deviceData}
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
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function levelFromSpend(value) {
  return Math.max(1, Math.floor(Number(value) / 50000) + 1);
}
