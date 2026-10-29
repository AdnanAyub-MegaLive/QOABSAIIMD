import { prisma } from "../../../../../lib/prisma";
import { realtimeTiming } from '@/lib/realtime-timing';
import { userChatCountry, countryMessageFilter } from "@/lib/country-chat";
import { chatSenderPerks } from "@/lib/chat-perks-cache";
import {
  mobileApiError,
  mobileJson,
  mobileOptions,
  requireMobileUser,
} from "../../../../../lib/mobile-api";
import {
  createMessage,
  emitConversationEvent,
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
    const visibility={conversationId:membership.conversationId,...(membership.conversation.kind==="WORLD"?countryMessageFilter(await userChatCountry(prisma,user.id)):{})};
    if(cursor&&!await prisma.message.findFirst({where:{...visibility,publicId:cursor},select:{id:true}}))throw Object.assign(new Error("Invalid message cursor."),{code:"INVALID_CURSOR"});
    const records = await prisma.message.findMany({
      where: visibility,
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
  const timing = realtimeTiming('dm_http');
  timing('request_received');
  try {
    const user = await requireMobileUser(request);
    timing('authenticated');
    const { conversationId } = await params;
    const membership = await requireConversationParticipant(
      decodeURIComponent(conversationId),
      user.id,
    );
    const body = await request.json();
    timing('membership_and_input');
    const senderPerks = await chatSenderPerks(user,requestOrigin(request));
    timing('sender_perks');
    const message = await createMessage(
      membership.conversation,
      user,
      body?.body,
      senderPerks,
      { clientMessageId: body?.clientMessageId, mediaId: body?.mediaId },
    );
    timing('message_persisted');
    await emitConversationEvent(globalThis.portalIo,membership.conversation.publicId,"message:new", {
        conversationId: membership.conversation.publicId,
        message,
      });
    timing('socket_published');
    return mobileJson({ success: true, data: { message } }, 201);
  } catch (error) {
    console.error("Message send failed", error);
    return mobileApiError(error, "MESSAGE_SEND_FAILED");
  }
}
