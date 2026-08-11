import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "../../../../auth";
import ProfileManager from "../../components/profile-manager";
import { prisma } from "../../../lib/prisma";
import MessageHistory from "./message-history";
import PortalSidebar from "../../components/portal-sidebar";

export default async function UserProfilePage({ params }) {
  const session = await auth();
  if (!session?.user) redirect("/");
  const { userId } = await params;
  const user = await prisma.user.findFirst({
    where: { publicId: decodeURIComponent(userId), deletedAt: null },
    include: {
      devices: { orderBy: { lastLoginAt: "desc" }, take: 1 },
      uploadAssignments: {
        where: { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
        select: {
          assignedAt: true,
          expiresAt: true,
          asset: {
            select: {
              publicId: true,
              name: true,
              category: true,
              fileName: true,
              mimeType: true,
              fileSize: true,
              isRoomBackground: true,
            },
          },
        },
        orderBy: { assignedAt: "desc" },
      },
      _count: { select: { sentGifts: true } },
    },
  });
  if (!user) notFound();
  const [messages, roomMessages, notifications, receivedGiftTotals] = await Promise.all([
    prisma.message.findMany({
      where: {
        OR: [
          {
            conversation: {
              kind: "DIRECT",
              participants: { some: { userId: user.id } },
            },
          },
          { conversation: { kind: "WORLD" }, senderId: user.id },
        ],
      },
      select: {
        publicId: true,
        senderId: true,
        body: true,
        createdAt: true,
        sender: { select: { publicId: true, name: true } },
        conversation: {
          select: {
            publicId: true,
            kind: true,
            name: true,
            participants: {
              select: {
                user: { select: { publicId: true, name: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    prisma.audioRoomMessage.findMany({
      where: { senderId: user.id },
      select: {
        publicId: true,
        roomPublicId: true,
        roomTitle: true,
        body: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    prisma.notification.findMany({
      where: { OR: [{ userId: null }, { userId: user.id }] },
      select: {
        publicId: true,
        title: true,
        body: true,
        createdAt: true,
        userId: true,
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.giftSettlement.aggregate({
      where: { giftTransaction: { recipientUserId: user.id } },
      _count: true,
      _sum: { grossCoins: true, reusableCoins: true },
    }),
  ]);
  const device = user.devices[0];
  const profile = {
    id: user.publicId,
    name: user.name,
    email: user.email,
    phone: user.phone,
    country: user.country ?? "—",
    gender: user.gender ? display(user.gender) : "Not set",
    dob: user.dob?.toISOString().slice(0, 10) ?? "Not set",
    role: display(user.role),
    roles: user.appRoles.map(display),
    status: display(user.status),
    vipLevel: user.vipLevel,
    isOfficial: Boolean(user.isOfficial),
    joined: user.createdAt.toLocaleDateString("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
    }),
    totalSpent: Number(user.totalSpent),
    balance: Number(user.coinBalance),
    gifts: user._count.sentGifts,
    giftsReceived: receivedGiftTotals._count,
    receivedGiftValue: Number(receivedGiftTotals._sum.grossCoins ?? 0n),
    reusableGiftCoins: Number(receivedGiftTotals._sum.reusableCoins ?? 0n),
    salaryCoinBalance: Number(user.hostSalaryCoinBalance),
    lastLogin: device?.lastLoginAt?.toLocaleString("en-US") ?? "Never",
    ip: device?.lastLoginIp ?? "—",
    mac: device?.macAddress ?? "—",
    location: device?.location ?? "Unknown",
    assignedAssets: user.uploadAssignments.map(
      ({ asset, assignedAt, expiresAt }) => ({
        id: asset.publicId,
        name: asset.name,
        category: display(asset.category),
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        fileSize: asset.fileSize,
        isRoomBackground: asset.isRoomBackground,
        assignedAt: assignedAt.toLocaleDateString("en-US", {
          month: "short",
          day: "2-digit",
          year: "numeric",
        }),
        expiresAt: expiresAt?.toLocaleString("en-US") ?? "Never",
        url: `/api/uploads/${asset.publicId}/file`,
      }),
    ),
  };
  const worldMessages = messages
    .filter((message) => message.conversation.kind === "WORLD")
    .map((message) => ({
      messageId: message.publicId,
      body: message.body,
      createdAt: message.createdAt.toLocaleString("en-US"),
      timestamp: message.createdAt.getTime(),
    }));
  const audioRoomMessages = roomMessages.map((message) => ({
    messageId: message.publicId,
    roomId: message.roomPublicId,
    roomTitle: message.roomTitle,
    body: message.body,
    createdAt: message.createdAt.toLocaleString("en-US"),
    timestamp: message.createdAt.getTime(),
  }));
  const directConversationMap = new Map();
  for (const message of messages.filter(
    (record) => record.conversation.kind === "DIRECT",
  )) {
    const existing = directConversationMap.get(message.conversation.publicId);
    const otherUser = message.conversation.participants
      .map(({ user: participant }) => participant)
      .find((participant) => participant.publicId !== user.publicId);
    const conversation = existing ?? {
      id: message.conversation.publicId,
      profiledUser: { id: user.publicId, name: user.name },
      otherUser: otherUser
        ? { id: otherUser.publicId, name: otherUser.name }
        : null,
      messages: [],
      lastActivity: message.createdAt.toLocaleString("en-US"),
      timestamp: message.createdAt.getTime(),
    };
    conversation.messages.push({
      id: message.publicId,
      senderId: message.sender?.publicId ?? null,
      senderName: message.sender?.name ?? "Deleted user",
      body: message.body,
      createdAt: message.createdAt.toLocaleString("en-US"),
      timestamp: message.createdAt.getTime(),
    });
    directConversationMap.set(message.conversation.publicId, conversation);
  }
  const directConversations = [...directConversationMap.values()]
    .map((conversation) => ({
      ...conversation,
      messages: conversation.messages.sort(
        (left, right) => left.timestamp - right.timestamp,
      ),
    }))
    .sort((left, right) => right.timestamp - left.timestamp);
  const notificationHistory = notifications.map((notification) => ({
    messageId: notification.publicId,
    title: notification.title,
    body: notification.body,
    scope: notification.userId ? "Personal" : "Global broadcast",
    createdAt: notification.createdAt.toLocaleString("en-US"),
    timestamp: notification.createdAt.getTime(),
  }));
  return (
    <main className="min-h-screen bg-[#f4f8f7] text-[#142c2a]">
      <PortalSidebar />
      <section className="lg:pl-64">
      <header className="border-b border-[#dfe9e7] bg-white px-6 py-5 md:px-10">
        <div className="mx-auto max-w-7xl">
          <Link href="/users" className="text-xs font-bold text-[#087f74]">
            ← Back to Users / Senders
          </Link>
        </div>
      </header>
      <div className="mx-auto max-w-7xl p-6 md:p-10">
        <div className="mb-7 flex items-center gap-4">
          <span className="grid h-16 w-16 place-items-center rounded-2xl bg-[#dff5f1] text-xl font-bold text-[#087f74]">
            {profile.name
              .split(" ")
              .map((part) => part[0])
              .join("")}
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{profile.name}</h1>
              <span
                className={`rounded-full px-2 py-1 text-[9px] font-bold ${profile.status === "Active" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}
              >
                {profile.status}
              </span>
            </div>
            <p className="mt-1 text-xs text-[#748782]">
              {profile.id} · {profile.phone}
              {profile.email ? ` · ${profile.email}` : ""}
            </p>
          </div>
        </div>
        <ProfileManager profile={profile} type="user" />
        <MessageHistory
          profile={{ id: user.publicId, name: user.name }}
          worldMessages={worldMessages}
          roomMessages={audioRoomMessages}
          directConversations={directConversations}
          notifications={notificationHistory}
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
