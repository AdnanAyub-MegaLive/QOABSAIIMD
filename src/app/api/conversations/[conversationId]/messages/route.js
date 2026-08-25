import { prisma } from "../../../../../lib/prisma";
import {
  mobileApiError,
  mobileJson,
  mobileOptions,
  requireMobileUser,
} from "../../../../../lib/mobile-api";
import {
  createMessage,
  requireConversationParticipant,
  serializeMessage,
} from "../../../../../lib/messaging";
import {
  requestOrigin,
  resolveUserPerks,
} from "../../../../../lib/user-perks";

export const dynamic = "force-dynamic";
export function OPTIONS() {
  return mobileOptions();
}

export async function GET(request, { params }) {
  try {
    const user = await requireMobileUser(request);
    const { conversationId } = await params;
    const membership = await requireConversationParticipant(
      decodeURIComponent(conversationId),
      user.id,
    );
    const url = new URL(request.url);
    const limit = Math.min(
      Math.max(Number(url.searchParams.get("limit")) || 50, 1),
      100,
    );
    const cursor = url.searchParams.get("cursor");
    const records = await prisma.message.findMany({
      where: { conversationId: membership.conversationId },
      include: {
        sender: {
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
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(cursor
        ? { cursor: { publicId: cursor }, skip: 1 }
        : {}),
    });
    const hasMore = records.length > limit;
    const page = records.slice(0, limit);
    const nextCursor = hasMore ? page[page.length - 1]?.publicId ?? null : null;
    const perks = await resolveUserPerks(
      page.map((message) => message.sender).filter(Boolean),
      requestOrigin(request),
      ["FRAMES", "BADGES", "CHAT_BOXES"],
    );
    return mobileJson({
      success: true,
      data: {
        messages: page
          .reverse()
          .map((message) =>
            serializeMessage(
              message,
              perks.get(message.sender?.publicId),
            ),
          ),
        nextCursor,
        hasMore,
      },
    });
  } catch (error) {
    console.error("Message history failed", error);
    return mobileApiError(error, "MESSAGES_FAILED");
  }
}

export async function POST(request, { params }) {
  try {
    const user = await requireMobileUser(request);
    const { conversationId } = await params;
    const membership = await requireConversationParticipant(
      decodeURIComponent(conversationId),
      user.id,
    );
    const body = await request.json();
    const perks = await resolveUserPerks(
      [user],
      requestOrigin(request),
      ["FRAMES", "BADGES", "CHAT_BOXES"],
    );
    const message = await createMessage(
      membership.conversation,
      user,
      body?.body,
      perks.get(user.publicId),
    );
    const recipients = await prisma.conversationParticipant.findMany({
      where: { conversationId: membership.conversationId },
      select: { user: { select: { publicId: true } } },
    });
    let delivery = globalThis.portalIo?.to(
      `conversation:${membership.conversation.publicId}`,
    );
    for (const recipient of recipients)
      delivery = delivery?.to(`user:${recipient.user.publicId}`);
    delivery?.emit("message:new", {
        conversationId: membership.conversation.publicId,
        message,
      });
    return mobileJson({ success: true, data: { message } }, 201);
  } catch (error) {
    console.error("Message send failed", error);
    return mobileApiError(error, "MESSAGE_SEND_FAILED");
  }
}
