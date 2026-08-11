import { calculateRankings } from "@/lib/ranking-service";
import { mobileApiError, mobileJson, mobileOptions, requireMobileUser } from "@/lib/mobile-api";
import {
  decodeRankingCursor,
  encodeRankingCursor,
  rankingPeriods,
  rankingTypes,
  rankingValidationError,
} from "@/lib/rankings";
import { requestOrigin } from "@/lib/user-perks";

export function OPTIONS() {
  return mobileOptions();
}

export async function GET(request) {
  try {
    const viewer = await requireMobileUser(request);
    const url = new URL(request.url);
    const type = String(url.searchParams.get("type") ?? "overall");
    const period = String(url.searchParams.get("period") ?? "week");
    if (!rankingTypes.has(type)) throw rankingValidationError("type is invalid.");
    if (!rankingPeriods.has(period)) throw rankingValidationError("period is invalid.");
    const requestedLimit = Number(url.searchParams.get("limit") ?? 20);
    if (!Number.isSafeInteger(requestedLimit) || requestedLimit < 1)
      throw rankingValidationError("limit must be a positive integer.");
    const result = await calculateRankings({
      type,
      period,
      origin: requestOrigin(request),
      offset: decodeRankingCursor(url.searchParams.get("cursor")),
      limit: Math.min(50, requestedLimit),
      viewerPublicId: viewer.publicId,
    });
    return mobileJson({
      success: true,
      data: {
        type: result.type,
        period: result.period,
        generatedAt: result.generatedAt,
        podium: result.podium,
        rankings: result.rankings,
        viewerRank: result.viewerRank,
        nextCursor: result.nextOffset === null ? null : encodeRankingCursor(result.nextOffset),
      },
    });
  } catch (error) {
    console.error("Mobile rankings failed", error);
    return mobileApiError(error, "RANKINGS_FAILED");
  }
}
