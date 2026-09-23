import { prisma } from "@/lib/prisma";
import {
  mobileApiError,
  mobileJson,
  mobileOptions,
  requireMobileUser,
} from "@/lib/mobile-api";
import {
  roomGiftHistoryLimit,
  serializeRoomGiftTransaction,
} from "@/lib/gift-leaderboard";
import { createPublicDisplayAssetUrl } from "@/lib/upload-assets";
import { requestOrigin } from "@/lib/user-perks";

export function OPTIONS() {
  return mobileOptions();
}

export async function GET(request, { params }) {
  try {
    await requireMobileUser(request);
    const { roomId: rawRoomId } = await params;
    const roomId = String(rawRoomId ?? "").trim();
    const searchParams = new URL(request.url).searchParams;
    const limit = roomGiftHistoryLimit(searchParams.get("limit"));
    const cursor = searchParams.get("cursor")?.trim() || null;
    const where = { roomId };

    const [total, page] = await Promise.all([
      prisma.giftTransaction.aggregate({
        where,
        _sum: { coinValue: true },
      }),
      prisma.giftTransaction.findMany({
        where,
        include: {
          sender: {
            select: { publicId: true, name: true, profileImage: true },
          },
          recipientUser: {
            select: { publicId: true, name: true, profileImage: true },
          },
          talent: {
            select: { publicId: true, displayName: true, profileImage: true },
          },
          giftAsset: {
            select: { publicId: true, name: true },
          },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        take: limit + 1,
      }),
    ]);
    const hasMore = page.length > limit;
    const transactions = hasMore ? page.slice(0, limit) : page;
    const origin = requestOrigin(request);

    return mobileJson({
      success: true,
      data: {
        roomId,
        totalCoins: (total._sum.coinValue ?? 0n).toString(),
        nextCursor: hasMore ? transactions.at(-1)?.id ?? null : null,
        transactions: transactions.map((transaction) =>
          serializeRoomGiftTransaction(
            transaction,
            transaction.giftAsset
              ? createPublicDisplayAssetUrl(origin, transaction.giftAsset.publicId)
              : null,
          ),
        ),
      },
    });
  } catch (error) {
    console.error("Room gift history failed", error);
    return mobileApiError(error, "GIFT_HISTORY_FAILED");
  }
}
