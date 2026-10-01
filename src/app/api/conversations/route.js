import { prisma } from "../../../lib/prisma";
import {
  mobileApiError,
  mobileJson,
  mobileOptions,
  requireMobileUser,
} from "../../../lib/mobile-api";
import { ensureWorldConversation } from "../../../lib/messaging";
import { assertUsersCanInteract, listBlockedUserIds } from "../../../lib/user-blocks";
import {
  requestOrigin,
  resolveUserPerks,
} from "../../../lib/user-perks";
import { formatDateOnly } from "../../../lib/date-only";

export const dynamic = "force-dynamic";
export function OPTIONS() {
  return mobileOptions();
}

async function conversationPayload(conversation, user, perks) {
  const other = conversation.participants.find(
    (participant) => participant.userId !== user.id,
  )?.user;
  const membership = conversation.participants.find(
    (participant) => participant.userId === user.id,
  );
  const lastMessage = conversation.messages[0] ?? null;
  const unreadCount = await prisma.message.count({
    where: {
      conversationId: conversation.id,
      senderId: { not: user.id },
      ...(membership?.lastReadAt
        ? { createdAt: { gt: membership.lastReadAt } }
        : {}),
    },
  });
  return {
    id: conversation.publicId,
    type: conversation.kind,
    name:
      conversation.kind === "WORLD"
        ? conversation.name
        : conversation.kind === "GROUP"
          ? conversation.name ?? "Group chat"
        : other?.name ?? "Deleted user",
    participant:
      conversation.kind === "DIRECT" && other
        ? {
            id: other.publicId,
            name: other.name,
            profileImage: other.profileImage,
            gender: other.gender ?? null,
            dob: formatDateOnly(other.dob),
            isVerified: Boolean(other.isVerified),
            isOfficial: Boolean(other.isOfficial),
            frameUrl: perks.get(other.publicId)?.frameUrl ?? null,
            badgeUrl: perks.get(other.publicId)?.badgeUrl ?? null,
          }
        : null,
    participants:
      conversation.kind === "GROUP"
        ? conversation.participants.map((participant) => ({
            id: participant.user.publicId,
            name: participant.user.name,
            profileImage: participant.user.profileImage ?? null,
            isVerified: Boolean(participant.user.isVerified),
            isOfficial: Boolean(participant.user.isOfficial),
            role: participant.role,
            joinedAt: participant.joinedAt.toISOString(),
          }))
        : null,
    lastMessage: lastMessage
      ? {
          id: lastMessage.publicId,
          senderId: lastMessage.sender?.publicId ?? null,
          body: lastMessage.body,
          createdAt: lastMessage.createdAt.toISOString(),
        }
      : null,
    lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
    unreadCount,
  };
}

const conversationInclude = {
  participants: {
    include: {
      user: {
        select: {
          id: true,
          publicId: true,
          name: true,
          profileImage: true,
          gender: true,
          dob: true,
          isVerified: true,
          isOfficial: true,
        },
      },
    },
  },
  messages: {
    orderBy: { createdAt: "desc" },
    take: 1,
    include: { sender: { select: { publicId: true } } },
  },
};

export async function GET(request) {
  try {
    const user = await requireMobileUser(request);
    await ensureWorldConversation(user.id);
    const conversations = await prisma.conversation.findMany({
      where: { participants: { some: { userId: user.id } } },
      include: conversationInclude,
      orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
      take: 200,
    });
    const blockedUserIds = await listBlockedUserIds(user.id);
    const visibleConversations = conversations.filter((conversation) => (
      conversation.kind !== "DIRECT"
      || !conversation.participants.some((participant) => (
        participant.userId !== user.id && blockedUserIds.has(participant.userId)
      ))
    ));
    const participantUsers = conversations.flatMap((conversation) =>
      conversation.participants.map((participant) => participant.user),
    );
    const perks = await resolveUserPerks(
      participantUsers,
      requestOrigin(request),
      ["FRAMES", "BADGES"],
    );
    return mobileJson({
      success: true,
      data: {
        conversations: await Promise.all(
          visibleConversations.map((conversation) =>
            conversationPayload(conversation, user, perks),
          ),
        ),
      },
    });
  } catch (error) {
    console.error("Conversation list failed", error);
    return mobileApiError(error, "CONVERSATIONS_FAILED");
  }
}

export async function POST(request) {
  try {
    const user = await requireMobileUser(request);
    const body = await request.json();
    const publicId = String(body?.participantId ?? body?.userId ?? "").trim();
    if (!publicId) {
      const error = new Error("A participant user ID is required.");
      error.code = "VALIDATION_ERROR";
      throw error;
    }
    if (publicId === user.publicId) throw new Error("SELF_CONVERSATION");
    const target = await prisma.user.findFirst({
      where: { publicId, deletedAt: null },
      select: { id: true },
    });
    if (!target) throw new Error("USER_NOT_FOUND");
    await assertUsersCanInteract(user.id, target.id);
    const directKey = [user.id, target.id].sort().join(":");
    const conversation = await prisma.conversation.upsert({
      where: { directKey },
      update: {},
      create: {
        publicId: `CONV-${crypto.randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase()}`,
        kind: "DIRECT",
        directKey,
        participants: {
          create: [{ userId: user.id }, { userId: target.id }],
        },
      },
      include: conversationInclude,
    });
    const perks = await resolveUserPerks(
      conversation.participants.map((participant) => participant.user),
      requestOrigin(request),
      ["FRAMES", "BADGES"],
    );
    return mobileJson(
      {
        success: true,
        data: {
          conversation: await conversationPayload(conversation, user, perks),
        },
      },
      201,
    );
  } catch (error) {
    console.error("Conversation creation failed", error);
    return mobileApiError(error, "CONVERSATION_CREATE_FAILED");
  }
}
